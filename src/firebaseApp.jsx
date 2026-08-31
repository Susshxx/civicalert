import { StrictMode, useEffect, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import { createRoot } from "react-dom/client";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  auth,
  createDepartmentAccount,
  db,
  isFirebaseConfigured,
} from "./firebase";
import Portal from "./portal";
import "../styles.css";

const blank = {
  categoryId: "",
  title: "",
  description: "",
  location: "",
  latitude: "",
  longitude: "",
  accuracy: "",
  priority: "Normal",
  name: "",
  email: "",
  phone: "",
};
const REPORTER_EMAIL_KEY = "civicalert-reporter-email";
const REPORTER_IP_KEY = "civicalert-reporter-ip";
const REPORTER_ID_KEY = "civicalert-reporter-id";
const PROFILE_KEY = "civicalert-user-profile";
const PROFILE_REGISTRY_KEY = "civicalert-profile-registry";
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_OTP_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_OTP_TEMPLATE_ID;
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "n8ydiog9";
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "civicalert_unsigned";

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password.length >= 6;
};

const PROFILE_REMINDER_KEY = "civicalert-profile-reminder";

const isProfileComplete = (profileData) => {
  if (!profileData) return false;
  const name = String(profileData.name || "").trim();
  const email = String(profileData.email || "").trim();
  const phone = String(profileData.phone || "").replace(/\D/g, "");
  const location = String(profileData.location || "").trim();
  const password = String(profileData.password || "").trim();

  return Boolean(
    name &&
      email &&
      validateEmail(email) &&
      profileData.isEmailVerified &&
      password.length >= 6 &&
      phone.length === 10 &&
      location,
  );
};

const shouldPromptForProfile = (profileData) => !isProfileComplete(profileData);

const shouldShowProfileReminder = () => {
  const lastPrompt = Number(window.localStorage.getItem(PROFILE_REMINDER_KEY) || "0");
  if (!lastPrompt) return true;
  return Date.now() - lastPrompt >= 24 * 60 * 60 * 1000;
};

const markProfileReminder = () => {
  window.localStorage.setItem(PROFILE_REMINDER_KEY, String(Date.now()));
};

if (EMAILJS_PUBLIC_KEY) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

const getStoredReporterKey = () => {
  const existing = window.localStorage.getItem(REPORTER_ID_KEY)?.trim();
  if (existing) return existing;

  const created = `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  window.localStorage.setItem(REPORTER_ID_KEY, created);
  return created;
};

const getStableReporterId = (email = "") => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return normalizedEmail ? `user-${normalizedEmail}` : getStoredReporterKey();
};

const getPublicIp = async () => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    if (!response.ok) return "";
    const payload = await response.json();
    return typeof payload?.ip === "string" ? payload.ip.trim() : "";
  } catch {
    return "";
  }
};
const getReporterId = () => getStoredReporterKey();
const buildMapsUrl = (location, latitude, longitude) => {
  const trimmedLocation = String(location || "").trim();
  const hasCoordinates =
    latitude !== undefined &&
    latitude !== null &&
    latitude !== "" &&
    longitude !== undefined &&
    longitude !== null &&
    longitude !== "";

  if (hasCoordinates) {
    return `https://www.google.com/maps?q=${Number(latitude)},${Number(longitude)}`;
  }

  if (trimmedLocation) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`;
  }

  return "";
};
const resolveMapsUrl = (report) =>
  report?.mapsUrl ||
  buildMapsUrl(report?.location, report?.latitude, report?.longitude);

const readProfileRegistry = () => {
  try {
    const raw = window.localStorage.getItem(PROFILE_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeProfileRegistry = (profiles) => {
  window.localStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(profiles));
};

const saveProfileToRegistry = (profileData) => {
  const email = String(profileData?.email || "").trim().toLowerCase();
  if (!email) return;
  const registry = readProfileRegistry();
  registry[email] = {
    ...profileData,
    email,
    password: profileData?.password || registry[email]?.password || "",
  };
  writeProfileRegistry(registry);
};

const reservedAdminEmails = new Set([
  "admin.gov@incidentreport.com",
]);

const isReservedAdminEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;
  if (reservedAdminEmails.has(normalizedEmail)) return true;

  if (!db) return false;

  try {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.some((docSnapshot) => {
      const user = docSnapshot.data() || {};
      const savedEmail = String(user.email || "").trim().toLowerCase();
      const role = String(user.role || "").trim();
      return savedEmail === normalizedEmail && ["System Administrator", "Department Officer"].includes(role);
    });
  } catch {
    return false;
  }
};

const saveProfileToFirestore = async (profileData) => {
  if (!db || !profileData?.email) return;
  const email = String(profileData.email).trim().toLowerCase();
  const profileDoc = {
    ...profileData,
    email,
    password: String(profileData.password || "").trim(),
    name: String(profileData.name || "").trim(),
    phone: String(profileData.phone || "").replace(/\D/g, "").slice(0, 10),
    location: String(profileData.location || "").trim(),
    latitude: profileData.latitude ?? "",
    longitude: profileData.longitude ?? "",
    accuracy: profileData.accuracy ?? "",
    isEmailVerified: Boolean(profileData.isEmailVerified),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, "userProfiles", email), profileDoc, { merge: true });
};

const loadSavedProfileRecord = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const localRecord = readProfileRegistry()[normalizedEmail] || null;
  if (!db) return localRecord;

  try {
    const snapshot = await getDoc(doc(db, "userProfiles", normalizedEmail));
    if (!snapshot.exists()) return localRecord;

    const dbRecord = snapshot.data();
    const merged = {
      ...(localRecord || {}),
      ...dbRecord,
      email: dbRecord?.email || normalizedEmail,
      password: dbRecord?.password || localRecord?.password || "",
    };

    if (Object.keys(merged).length) {
      saveProfileToRegistry(merged);
    }

    return merged;
  } catch {
    return localRecord;
  }
};

const hydratePersistedProfile = async () => {
  const localValue = localStorage.getItem(PROFILE_KEY);
  if (localValue) {
    try {
      const parsed = JSON.parse(localValue);
      if (parsed?.email) return parsed;
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }

  const savedEmail = window.localStorage.getItem(REPORTER_EMAIL_KEY)?.trim().toLowerCase();
  if (!savedEmail) return null;

  const savedProfile = await loadSavedProfileRecord(savedEmail);
  if (savedProfile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(savedProfile));
  }
  return savedProfile || null;
};

const errorText = (error) => {
  if (
    error?.code === "auth/configuration-not-found" ||
    error?.message?.includes("CONFIGURATION_NOT_FOUND")
  )
    return "Firebase Authentication is not configured for this project. Enable Authentication and Email/Password sign-in in the Firebase Console.";
  return (
    error?.message?.replace("Firebase: ", "") ||
    "Something went wrong. Please try again."
  );
};

function Shell({ children, admin = false, onProfileClick }) {
  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => window.location.reload()}
          aria-label="CivicAlert home"
        >
          <span className="brand-mark">+</span>
          <span>
            Civic<span>Alert</span>
          </span>
        </button>
        {admin && <span className="portal-label">Administration portal</span>}
        <div className="header-rule" />
        {!admin && (
          <button className="profile-button" onClick={onProfileClick} aria-label="My Profile">
            <span className="profile-icon">👤</span>
            <span>My Profile</span>
          </button>
        )}
      </header>
      {children}
    </>
  );
}

function LocationField({ form, update, disabled = false }) {
  const [state, setState] = useState({ status: "idle" });
  const detect = () => {
    if (disabled) return;
    if (!navigator.geolocation)
      return setState({
        status: "error",
        error: "Live location is not supported by this browser.",
      });
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let landmark = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&zoom=18&addressdetails=1`,
            { headers: { Accept: "application/json" } },
          );
          if (response.ok) {
            const result = await response.json();
            landmark = result.display_name || landmark;
          }
        } catch {
          /* Coordinates remain available when reverse geocoding is unavailable. */
        }
        update({ target: { name: "location", value: landmark } });
        update({ target: { name: "latitude", value: coords.latitude } });
        update({ target: { name: "longitude", value: coords.longitude } });
        update({ target: { name: "accuracy", value: Math.round(coords.accuracy) } });
        setState({
          status: "ready",
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: Math.round(coords.accuracy),
        });
      },
      (error) =>
        setState({
          status: "error",
          error:
            error.code === 1
              ? "Location permission was denied. Enter a landmark instead."
              : "Location could not be detected. Enter a landmark instead.",
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  return (
    <label>
      Location{" "}
      <div className="location-input">
        <input
          name="location"
          value={form.location}
          onChange={(event) => {
            if (disabled) return;
            update(event);
            if (event.target.value.trim()) {
              update({ target: { name: "latitude", value: "" } });
              update({ target: { name: "longitude", value: "" } });
              update({ target: { name: "accuracy", value: "" } });
            }
            setState({ status: "idle" });
          }}
          required
          placeholder="Street, landmark or area"
          disabled={disabled}
        />
        <button
          className="location-button"
          type="button"
          onClick={detect}
          disabled={disabled || state.status === "loading"}
        >
          {state.status === "loading" ? "Detecting..." : "Live Gps"}
        </button>
      </div>
      {state.status === "ready" && (
        <span className="location-success">
          Exact point detected, accurate to about {state.accuracy}m.
        </span>
      )}
      {state.status === "error" && (
        <span className="location-error">{state.error}</span>
      )}
      <input type="hidden" name="latitude" value={state.latitude || ""} />
      <input type="hidden" name="longitude" value={state.longitude || ""} />
      <input type="hidden" name="accuracy" value={state.accuracy || ""} />
    </label>
  );
}

function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() =>
        setError(
          "Camera access was denied or is unavailable. Check browser permissions.",
        ),
      );
    return () =>
      streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob)
          onCapture(
            new File([blob], `evidence-${Date.now()}.jpg`, {
              type: "image/jpeg",
            }),
          );
      },
      "image/jpeg",
      0.9,
    );
  };
  return (
    <div className="camera-panel">
      <video ref={videoRef} autoPlay playsInline muted />
      <div className="camera-actions">
        <button type="button" className="primary-button" onClick={capture}>
          Capture photo
        </button>
        <button type="button" className="outline-button" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && <p className="location-error">{error}</p>}
    </div>
  );
}

function EvidenceField({ files, setFiles }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const addFiles = (event) => {
    const selected = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/"),
    );
    setFiles((current) => [...current, ...selected].slice(0, 8));
    event.target.value = "";
  };
  const addCaptured = (file) => {
    setFiles((current) => [...current, file].slice(0, 8));
    setCameraOpen(false);
  };
  return (
    <div className="evidence-field">
      <div className="evidence-heading">
        <div>
          <strong>Evidence photos</strong>
          <span className="field-hint">
            Add up to 8 photos of the issue. Photos are stored securely.
          </span>
        </div>
        <div className="photo-actions">
          <button
            type="button"
            className="photo-button camera-button"
            onClick={() => setCameraOpen(true)}
          >
            Take photo
          </button>
          <label className="photo-button">
            Add photos
            <input type="file" accept="image/*" multiple onChange={addFiles} />
          </label>
        </div>
      </div>
      {cameraOpen && (
        <CameraCapture
          onCapture={addCaptured}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {files.length > 0 && (
        <div className="photo-grid">
          {files.map((file, index) => (
            <div
              className="photo-preview"
              key={`${file.name}-${file.lastModified}-${index}`}
            >
              <img src={URL.createObjectURL(file)} alt="Evidence preview" />
              <button
                type="button"
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                aria-label={`Remove photo ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <small className="field-hint">
        Take photo opens your camera. Add photos selects existing images.
        Maximum 8.
      </small>
    </div>
  );
}

function ProfileDialog({ isOpen, onClose, onSave, profile }) {
  const isEditing = !!profile?.password; // User has an existing profile with password
  const createFormState = (currentProfile = profile) => ({
    name: currentProfile?.name || "",
    email: currentProfile?.email || "",
    phone: currentProfile?.phone || "",
    location: currentProfile?.location || "",
    latitude: currentProfile?.latitude || "",
    longitude: currentProfile?.longitude || "",
    accuracy: currentProfile?.accuracy || "",
    password: currentProfile?.password || "",
  });
  const [form, setForm] = useState(createFormState());
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [isEmailVerified, setIsEmailVerified] = useState(profile?.isEmailVerified || false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const profileDetailsLocked = alreadyRegistered && !profileLoaded;
  const savedProfileSnapshot = createFormState(profile);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedProfileSnapshot);
  const saveButtonDisabled = !isEmailVerified || !isDirty;
  const saveButtonClassName = saveButtonDisabled
    ? "primary-button save-button-inactive"
    : "primary-button save-button-active";

  useEffect(() => {
    if (!isOpen) return;
    const nextForm = createFormState();
    setForm(nextForm);
    setIsEmailVerified(Boolean(profile?.isEmailVerified || false));
    setOtp("");
    setGeneratedOtp("");
    setOtpSent(false);
    setSendingOtp(false);
    setOtpError("");
    setAlreadyRegistered(false);
    setProfileLoaded(false);
    setShowPassword(false);
  }, [isOpen, profile]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!otpError) return undefined;
    const timer = window.setTimeout(() => setOtpError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [otpError]);

  const update = (event) => {
    setError("");
    setOtpError("");
    // Don't allow email change if already verified
    if (event.target.name === "email" && isEmailVerified) {
      return;
    }
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleInputChange = (event) => {
    if (event.target.name === "email" && isEmailVerified) {
      return; // Email is locked when verified
    }
    update(event);
  };

  const sendOtp = async () => {
    if (!form.email || !validateEmail(form.email)) {
      setOtpError("Please enter a valid email address.");
      return;
    }

    if (await isReservedAdminEmail(form.email)) {
      setOtpError("This email is reserved for administrator access. Please use a different email for your user profile.");
      return;
    }

    setSendingOtp(true);
    setOtpError("");
    
    try {
      const newOtp = generateOTP();
      setGeneratedOtp(newOtp);
      
      // Send OTP via EmailJS
      if (EMAILJS_SERVICE_ID && EMAILJS_OTP_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_OTP_TEMPLATE_ID,
          {
            to_email: form.email,
            otp: newOtp,
            recipient_name: form.name || "User",
          },
        );
      } else {
        setOtpError("Email delivery is not configured. Please add EmailJS environment variables.");
        return;
      }

      setOtpSent(true);
      setError("OTP sent to your email. Please check your inbox.");
    } catch (err) {
      setOtpError("Failed to send OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = () => {
    if (otp === generatedOtp) {
      setIsEmailVerified(true);
      setOtpSent(false);
      setOtp("");
      setGeneratedOtp("");
      setError("Email verified successfully!");
    } else {
      setOtpError("Invalid OTP. Please try again.");
    }
  };

  const lookupRegisteredProfile = async () => {
    const trimmedEmail = form.email.trim();
    if (!trimmedEmail || !validateEmail(trimmedEmail)) {
      setError("Please enter a valid email address before checking registration.");
      return;
    }

    if (await isReservedAdminEmail(trimmedEmail)) {
      setError("This email is unavailable. Please use a different email for your user profile.");
      setAlreadyRegistered(false);
      setProfileLoaded(false);
      return;
    }

    const stored = await loadSavedProfileRecord(trimmedEmail);
    if (!stored) {
      setError("This email is not registered yet. Please fill the profile manually.");
      setAlreadyRegistered(false);
      setProfileLoaded(false);
      return;
    }

    setAlreadyRegistered(true);
    setProfileLoaded(false);
    setError("Email found. Enter the saved password to auto-fill your previous details.");
  };

  const loadRegisteredProfile = async () => {
    const trimmedEmail = form.email.trim().toLowerCase();

    if (await isReservedAdminEmail(trimmedEmail)) {
      setError("This email is reserved for administrator access. Please use a different email for your user profile.");
      return;
    }

    const stored = await loadSavedProfileRecord(trimmedEmail);

    if (!stored) {
      setError("This email is not registered yet.");
      return;
    }

    if (!form.password || form.password !== String(stored.password || "")) {
      setError("Incorrect password for this saved profile.");
      return;
    }

    setForm({
      name: stored.name || "",
      email: stored.email || "",
      phone: stored.phone || "",
      location: stored.location || "",
      latitude: stored.latitude || "",
      longitude: stored.longitude || "",
      accuracy: stored.accuracy || "",
      password: stored.password || "",
    });
    setIsEmailVerified(Boolean(stored.isEmailVerified));
    setAlreadyRegistered(false);
    setProfileLoaded(true);
    setError("Saved profile loaded successfully.");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedLocation = form.location.trim();
    const digitsPhone = String(form.phone || "").replace(/\D/g, "");

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    if (!trimmedEmail || !validateEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (await isReservedAdminEmail(trimmedEmail)) {
      setError("This email is reserved for administrator access. Please use a different email for your user profile.");
      return;
    }

    if (!trimmedLocation) {
      setError("Please enter your location or use Live GPS.");
      return;
    }

    if (!digitsPhone || digitsPhone.length !== 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    if (!isEditing && (!form.password || !validatePassword(form.password))) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!isEmailVerified) {
      setError("Please verify your email address before saving.");
      return;
    }

    const profileToSave = {
      ...form,
      name: trimmedName,
      email: trimmedEmail,
      location: trimmedLocation,
      phone: digitsPhone,
      isEmailVerified,
    };

    if (isEditing && !form.password) {
      profileToSave.password = profile.password;
    }

    onSave(profileToSave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop">
      <div className="profile-dialog">
        <button className="dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>My Profile</h2>
        <p className="field-hint">Your details will auto-fill in reports.</p>
        
        <form onSubmit={handleSubmit}>
          <div className="profile-section">
            <h3>Personal Information</h3>
            <label>
              Full Name
              <input
                name="name"
                value={form.name}
                onChange={handleInputChange}
                placeholder="Your full name"
                required
                disabled={profileDetailsLocked}
              />
            </label>
            <label>
              Email {isEmailVerified && <span className="verified-badge">✓ Verified</span>}
              <input
                name="email"
                value={form.email}
                onChange={handleInputChange}
                type="email"
                placeholder="you@example.com"
                disabled={isEmailVerified || isEditing}
                required
              />
            </label>

            {!isEmailVerified && !isEditing && (
              <div className="otp-section">
                <button
                  type="button"
                  className="outline-button"
                  onClick={lookupRegisteredProfile}
                  disabled={alreadyRegistered}
                >
                  Already registered
                </button>
                {alreadyRegistered && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={loadRegisteredProfile}
                  >
                    Load saved profile
                  </button>
                )}
                <button
                  type="button"
                  className="outline-button"
                  onClick={sendOtp}
                  disabled={sendingOtp || !form.email || alreadyRegistered}
                >
                  {sendingOtp ? "Sending..." : "Send OTP"}
                </button>
                
                {otpSent && (
                  <div className="otp-input-group">
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      maxLength="6"
                      className="otp-input"
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={verifyOtp}
                    >
                      Verify
                    </button>
                  </div>
                )}
                
                {otpError && <p className="location-error">{otpError}</p>}
              </div>
            )}
            
            <label>
              Password
              <div className="password-input-group">
                <input
                  name="password"
                  value={form.password}
                  onChange={handleInputChange}
                  type={showPassword ? "text" : "password"}
                  placeholder={isEditing ? "" : "Create a password (min 6 characters)"}
                  minLength="6"
                  required={!isEditing}
                  readOnly={isEditing}
                  className={isEditing ? "password-readonly" : ""}
                />
                {isEditing && (
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "View"}
                  </button>
                )}
              </div>
            </label>
            
            <label>
              Phone Number
              <input
                name="phone"
                value={form.phone}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                  handleInputChange({ target: { name: "phone", value: digits } });
                }}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                minLength="10"
                maxLength="10"
                placeholder="10-digit phone number"
                disabled={profileDetailsLocked}
              />
            </label>
            <LocationField
              form={form}
              update={update}
              disabled={profileDetailsLocked}
            />
          </div>

          {error && <p className="location-error">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="outline-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className={saveButtonClassName}
              type="submit"
              disabled={saveButtonDisabled}
            >
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportForm({ categories, onSubmit, onOpenMyReports, profile }) {
  const [identified, setIdentified] = useState(false);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(blank);
  const update = (event) =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));

  const handleIdentifyToggle = (checked) => {
    setIdentified(checked);
    if (checked && profile) {
      setForm((current) => ({
        ...current,
        name: profile.name || "",
        email: profile.email || "",
        phone: profile.phone || "",
      }));
    } else if (!checked) {
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        phone: "",
      }));
    }
  };

  const send = (event) => {
    event.preventDefault();
    onSubmit({ ...form, files });
    setForm(blank);
    setFiles([]);
    setIdentified(false);
  };
  return (
    <section>
      <div className="page-intro">
        <div>
          <p className="eyebrow">Civic response network</p>
          <h1>
            Make your community
            <br />
            <em>safer, together.</em>
          </h1>
          <p className="intro-copy">
            Tell the right department what happened. Your report is routed
            directly to the people who can help.
          </p>
        </div>
        <div className="intro-actions">
          <button className="primary-button intro-report-button color-blue" type="button" onClick={onOpenMyReports}>
            My reports
          </button>
          <div className="intro-note">
            <span className="pulse" />
            <strong>Response teams online</strong>
            <small>Reports are reviewed daily</small>
          </div>
        </div>
      </div>
      <div className="report-layout">
        <form className="report-form panel" onSubmit={send}>
          <div className="panel-heading">
            <div>
              <span className="step-label">01 / 03</span>
              <h2>What happened?</h2>
            </div>
            <span className="shield">Secure</span>
          </div>
          <label>
            Issue category <span className="required">Required</span>
            <select
              name="categoryId"
              value={form.categoryId}
              onChange={update}
              required
            >
              <option value="">Select the department</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Short title{" "}
            <input
              name="title"
              value={form.title}
              onChange={update}
              required
              maxLength="80"
              placeholder="Give your report a clear title"
            />
          </label>
          <label>
            Describe the issue{" "}
            <textarea
              name="description"
              value={form.description}
              onChange={update}
              required
              maxLength="700"
              placeholder="Add useful details: what happened, when, and who may be affected..."
            />
            <span className="field-hint">
              Be specific. It helps teams respond faster.
            </span>
          </label>
          <div className="form-row">
            <LocationField form={form} update={update} />
            <label>
              Urgency{" "}
              <select name="priority" value={form.priority} onChange={update}>
                <option>Normal</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </label>
          </div>
          <EvidenceField files={files} setFiles={setFiles} />
          <div className="identity-box">
            <div>
              <strong>How should we contact you?</strong>
              <small>
                Your identity is optional. Anonymous reports are still fully
                routed.
              </small>
            </div>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={identified}
                onChange={(event) => handleIdentifyToggle(event.target.checked)}
              />
              <span className="toggle" />
              <span>Identify me</span>
            </label>
          </div>
          {identified && (
            <div className="identified-fields">
              <div className="form-row">
                <label>
                  Your name{" "}
                  <input
                    name="name"
                    value={form.name}
                    onChange={update}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  Email{" "}
                  <input
                    name="email"
                    value={form.email}
                    onChange={update}
                    type="email"
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Phone number{" "}
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, 10)
                      update({ target: { name: "phone", value: digits } })
                    }}
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    minLength="10"
                    maxLength="10"
                    placeholder="10-digit phone number"
                    required
                  />
                </label>
              </div>
            </div>
          )}
          <button className="primary-button" type="submit">
            Submit report <span>→</span>
          </button>
          <p className="form-footnote">
            By submitting, you agree that CivicAlert may use this information to
            coordinate a response.
          </p>
        </form>
        <aside className="report-aside">
          <div className="route-card">
            <span className="route-icon">◎</span>
            <p className="eyebrow">Smart routing</p>
            <h3>
              One report.
              <br />
              Right department.
            </h3>
            <p>
              We match your category to its responsible authority and notify
              their team by email.
            </p>
            <div className="route-list">
              <span>
                <b>01</b>Choose a category
              </span>
              <span>
                <b>02</b>Add the location
              </span>
              <span>
                <b>03</b>We coordinate action
              </span>
            </div>
          </div>
          <div className="privacy-note">
            <span>✓</span>
            <p>
              <strong>Your privacy matters</strong>
              <br />
              Choose anonymous reporting when you do not want to share your
              identity.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Reports({ reports, setView }) {
  const statusClass = (status = "Received") =>
    status.toLowerCase().replace(/\s+/g, "-");

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">This session</p>
          <h1>My reports</h1>
        </div>
        <button className="outline-button" onClick={() => setView("report")}>
          + New report
        </button>
      </div>
      <div className="report-list">
        {reports.length ? (
          reports.map((item) => (
            <article className="report-item" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p>
                  {item.category} · {(item.mapsUrl || resolveMapsUrl(item)) ? (
                    <a
                      className="map-link"
                      href={item.mapsUrl || resolveMapsUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.location}
                    </a>
                  ) : (
                    item.location
                  )}
                </p>
                <p>{item.description}</p>
                {(item.mapsUrl || resolveMapsUrl(item)) && (
                  <a
                    className="map-link"
                    href={item.mapsUrl || resolveMapsUrl(item)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open exact location in Google Maps ↗
                  </a>
                )}
                {item.evidence?.length > 0 && (
                  <div className="evidence-links">
                    <strong>
                      {item.evidence.length} evidence photo
                      {item.evidence.length === 1 ? "" : "s"}
                    </strong>
                    {item.evidence.map((photo) => (
                      <a
                        key={photo.url}
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={photo.url} alt={photo.name} />
                      </a>
                    ))}
                  </div>
                )}
                <div className="report-timeline">
                  <strong>Timeline</strong>
                  {(Array.isArray(item.timeline) && item.timeline.length ? item.timeline : [{ label: "Report received", status: item.status, note: "Report logged in the system" }]).slice(-4).map((event, index) => (
                    <div className="timeline-item" key={`${item.id}-timeline-${index}`}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{event.label || event.status || "Update"}</strong>
                        <small>
                          {event.note || "Updated"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="report-meta">
                <span className={`status ${statusClass(item.status)}`}>
                  {item.status}
                </span>
                <p>{item.reference}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <strong>No reports yet</strong>Submit an incident and it will appear
            here with its reference number and progress.
          </div>
        )}
      </div>
    </section>
  );
}

async function uploadEvidence(files) {
  if (!files?.length) return [];
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary upload preset is not configured. Create an unsigned upload preset in Cloudinary and set VITE_CLOUDINARY_UPLOAD_PRESET in the .env file.",
    );
  }

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "civicalert/evidence");

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message || "Cloudinary upload failed.");
      }

      return {
        url: result.secure_url || result.url,
        publicId: result.public_id,
        name: file.name || "evidence-image",
      };
    }),
  );

  return uploaded;
}

function PublicApp() {
  const [categories, setCategories] = useState([]);
  const [reports, setReports] = useState([]);
  const [view, setView] = useState("report");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!isFirebaseConfigured) return setLoading(false);
    getDocs(query(collection(db, "categories"), orderBy("name")))
      .then((snapshot) =>
        setCategories(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
      )
      .catch((error) => setMessage(errorText(error)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const restoreProfile = async () => {
      try {
        const savedProfile = await hydratePersistedProfile();
        if (savedProfile) {
          setProfile(savedProfile);
        }
      } catch {
        localStorage.removeItem(PROFILE_KEY);
      }
    };

    restoreProfile();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || profileDialogOpen) return;
    if (shouldPromptForProfile(profile) && shouldShowProfileReminder()) {
      const timer = window.setTimeout(() => {
        setProfileDialogOpen(true);
        markProfileReminder();
      }, 10000);
      return () => window.clearTimeout(timer);
    }
  }, [profile, profileDialogOpen]);

  const handleProfileSave = async (profileData) => {
    const cleanedProfile = {
      ...profileData,
      email: String(profileData.email || "").trim().toLowerCase(),
      name: String(profileData.name || "").trim(),
      phone: String(profileData.phone || "").replace(/\D/g, "").slice(0, 10),
      location: String(profileData.location || "").trim(),
    };

    setProfile(cleanedProfile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(cleanedProfile));
    saveProfileToRegistry(cleanedProfile);

    try {
      await saveProfileToFirestore(cleanedProfile);
    } catch (error) {
      setMessage(errorText(error));
      return;
    }

    if (cleanedProfile.email && cleanedProfile.isEmailVerified) {
      window.localStorage.setItem(REPORTER_EMAIL_KEY, cleanedProfile.email.trim().toLowerCase());
    }

    setMessage("Profile saved successfully.");
  };
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const loadReports = async () => {
      const storedEmail = window.localStorage
        .getItem(REPORTER_EMAIL_KEY)
        ?.trim()
        .toLowerCase();
      const storedIp = window.localStorage.getItem(REPORTER_IP_KEY)?.trim();
      const profileEmail = profile?.email?.trim().toLowerCase() || "";
      const stableEmailReporterId = storedEmail ? getStableReporterId(storedEmail) : "";
      const profileReporterId = profileEmail ? getStableReporterId(profileEmail) : "";
      const reporterId = getReporterId();
      const currentIp = await getPublicIp();

      const identityValues = new Set();
      if (storedEmail) identityValues.add(storedEmail);
      if (profileEmail) identityValues.add(profileEmail);
      if (storedIp) identityValues.add(storedIp);
      if (currentIp) identityValues.add(currentIp);
      if (reporterId) identityValues.add(reporterId);
      if (stableEmailReporterId) identityValues.add(stableEmailReporterId);
      if (profileReporterId) identityValues.add(profileReporterId);

      if (!identityValues.size) {
        setReports([]);
        return;
      }

      const snapshot = await getDocs(collection(db, "reports"));
      const filtered = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((report) => {
          const email = String(report.email || "").trim().toLowerCase();
          const ip = String(report.reporterIp || "").trim();
          const id = String(report.reporterId || "").trim();

          const sameEmail = Boolean(storedEmail && email === storedEmail);
          const sameProfileEmail = Boolean(profileEmail && email === profileEmail);
          const sameStableEmailReporterId = Boolean(
            stableEmailReporterId && id === stableEmailReporterId,
          );
          const sameProfileReporterId = Boolean(
            profileReporterId && id === profileReporterId,
          );
          const sameDevice = Boolean(reporterId && id === reporterId);
          const sameStoredIp = Boolean(storedIp && ip === storedIp);
          const sameCurrentIp = Boolean(currentIp && ip === currentIp);

          return (
            sameEmail ||
            sameProfileEmail ||
            sameStableEmailReporterId ||
            sameProfileReporterId ||
            sameDevice ||
            sameStoredIp ||
            sameCurrentIp
          );
        })
        .map((report) => {
          const existingTimeline = Array.isArray(report.timeline) && report.timeline.length
            ? report.timeline
            : [{
                label: "Report submitted",
                status: report.status || "Received",
                note: `Submitted by ${report.reporter || "Anonymous"}`,
                timestamp: report.createdAt?.toDate ? report.createdAt.toDate().toISOString() : new Date().toISOString(),
              }];

          if (!Array.isArray(report.timeline) || !report.timeline.length) {
            updateDoc(doc(db, "reports", report.id), {
              timeline: existingTimeline,
            }).catch(() => {});
          }

          return { ...report, timeline: existingTimeline };
        })
        .sort((a, b) => {
          const left = getSortableTimestamp(a.createdAt);
          const right = getSortableTimestamp(b.createdAt);
          return right - left;
        });

      setReports(filtered);
    };

    loadReports().catch(() => {
      setReports([]);
    });
  }, [profile]);

  const getSortableTimestamp = (value) => {
    if (!value) return 0;

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (typeof value?.toDate === "function") {
      return value.toDate().getTime();
    }

    if (typeof value?.seconds === "number") {
      return value.seconds * 1000;
    }

    if (typeof value === "number") {
      return value;
    }

    return 0;
  };

  const submit = async (form) => {
    if (!isFirebaseConfigured)
      return setMessage(
        "Firebase is not configured yet. Add the project values to your environment file.",
      );
    const category = categories.find((item) => item.id === form.categoryId);
    const mapsUrl = buildMapsUrl(form.location, form.latitude, form.longitude);
    try {
      setMessage(
        form.files?.length
          ? "Uploading evidence photos..."
          : "Submitting report...",
      );
      const { files, ...reportFields } = form;
      const evidence = await uploadEvidence(files);
      const reference = `CA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const reporterIp = (await getPublicIp()) || "";
      
      // Use profile email as primary, fallback to form email
      const profileEmail = profile?.email?.trim().toLowerCase() || "";
      const formEmail = reportFields.email?.trim().toLowerCase() || "";
      const normalizedEmail = profileEmail || formEmail;
      
      const reporterId = getStableReporterId(normalizedEmail);
      const latitude = reportFields.latitude !== undefined ? Number(reportFields.latitude) : null;
      const longitude = reportFields.longitude !== undefined ? Number(reportFields.longitude) : null;
      const report = {
        ...reportFields,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        accuracy: reportFields.accuracy !== undefined && reportFields.accuracy !== "" ? Number(reportFields.accuracy) : null,
        email: normalizedEmail,
        evidence,
        mapsUrl,
        reference,
        category: category?.name || "Unassigned",
        reporter: form.name || profile?.name || "Anonymous",
        reporterIp,
        reporterId,
        status: "Received",
        timeline: [
          {
            label: "Report submitted",
            status: "Received",
            timestamp: new Date().toISOString(),
            note: `Submitted by ${form.name || profile?.name || "Anonymous"}`,
          },
        ],
        createdAt: new Date().toISOString(),
      };
      const saved = await addDoc(collection(db, "reports"), report);
      if (normalizedEmail) {
        window.localStorage.setItem(REPORTER_EMAIL_KEY, normalizedEmail);
      }
      if (reporterIp) {
        window.localStorage.setItem(REPORTER_IP_KEY, reporterIp);
      }
      window.localStorage.setItem(REPORTER_ID_KEY, reporterId);

      const authorityEmail = category?.email?.trim();
      if (authorityEmail) {
        const evidenceLinks = (evidence || [])
          .map((item) => {
            const candidate = item?.url || item?.secure_url || item?.link || "";
            if (!candidate || typeof candidate !== "string") return "";
            return candidate.startsWith("http") ? candidate : "";
          })
          .filter(Boolean)
          .slice(0, 3);

        const emailBody = [
          `New report received: ${reference}`,
          `Category: ${category?.name || "Unassigned"}`,
          `Title: ${report.title}`,
          `Location: ${report.location || "Not provided"}`,
          `Priority: ${report.priority || "Normal"}`,
          `Reporter: ${report.reporter || "Anonymous"}`,
          `Contact email: ${report.email || "Not provided"}`,
          `Phone: ${report.phone || "Not provided"}`,
          `Description: ${report.description || "No details provided"}`,
          `Status: ${report.status}`,
          evidenceLinks.length
            ? `Evidence links:\n${evidenceLinks.join("\n")}`
            : "Evidence links: No uploaded evidence (photos stored in the app record, not emailed)",
          `View in system: ${window.location.origin}`,
        ].join("\n\n");

        const templateParams = {
          to_email: authorityEmail,
          reply_to: report.email || "noreply@civicalert.local",
          reference,
          category: category?.name || "Unassigned",
          title: report.title,
          location: report.location || "Not provided",
          priority: report.priority || "Normal",
          reporter: report.reporter || "Anonymous",
          contact_email: report.email || "Not provided",
          phone: report.phone || "Not provided",
          description: report.description || "No details provided",
          status: report.status,
          maps_url: report.mapsUrl || "",
          view_link: window.location.origin,
          image_links: evidenceLinks.length ? evidenceLinks.join("\n") : "No uploaded evidence (photos stored in the app record, not emailed)",
          evidence_count: String(evidenceLinks.length),
          message: emailBody,
        };

        const canUseEmailJs = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY;

        try {
          if (canUseEmailJs) {
            await emailjs.send(
              EMAILJS_SERVICE_ID,
              EMAILJS_TEMPLATE_ID,
              templateParams,
            );
          } else {
            const mailtoUrl = `mailto:${authorityEmail}?subject=${encodeURIComponent(
              `New CivicAlert report: ${reference}`,
            )}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoUrl;
          }
        } catch {
          const fallbackMailto = `mailto:${authorityEmail}?subject=${encodeURIComponent(
            `New CivicAlert report: ${reference}`,
          )}&body=${encodeURIComponent(emailBody)}`;
          window.location.href = fallbackMailto;
        }
      }

      setReports((current) => [{ ...report, id: saved.id }, ...current]);
      setMessage(`Report ${reference} submitted successfully.`);
      setView("track");
    } catch (error) {
      setMessage(errorText(error));
    }
  };
  if (loading)
    return (
      <Shell>
        <main>
          <div className="loading-state">Loading reporting categories...</div>
        </main>
      </Shell>
    );
  return (
    <Shell onProfileClick={() => setProfileDialogOpen(true)}>
      <header className="public-nav">
        <button
          className={view === "report" ? "active" : ""}
          onClick={() => setView("report")}
        >
          Report an issue
        </button>
        <button
          className={view === "track" ? "active" : ""}
          onClick={() => setView("track")}
        >
          My reports <span className="nav-count">{reports.length}</span>
        </button>
      </header>
      <main>
        {view === "report" ? (
          <ReportForm
            categories={categories}
            onSubmit={submit}
            onOpenMyReports={() => setView("track")}
            profile={profile}
          />
        ) : (
          <Reports reports={reports} setView={setView} />
        )}
      </main>
      <div className={`toast ${message ? "show" : ""}`} role="status">
        {message}
      </div>
      <ProfileDialog
        isOpen={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        onSave={handleProfileSave}
        profile={profile}
      />
    </Shell>
  );
}

function AdminLogin({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="login-panel panel">
      <p className="eyebrow">Restricted access</p>
      <h1>Admin portal</h1>
      <p>Sign in with an authorized CivicAlert administrator account.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password);
        }}
      >
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="username"
            required
            placeholder="admin@your-domain.gov"
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="primary-button" type="submit">
          Sign in <span>→</span>
        </button>
        {error && <p className="location-error">{error}</p>}
      </form>
    </div>
  );
}

function AdminPortal() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (current) => {
      if (!current) {
        setProfile(null);
        return;
      }
      const profileSnapshot = await getDoc(doc(db, "users", current.uid));
      if (
        profileSnapshot.exists() &&
        profileSnapshot.data().role === "System Administrator"
      )
        setProfile({
          id: profileSnapshot.id,
          ...profileSnapshot.data(),
          email: current.email,
        });
      else {
        await signOut(auth);
        setProfile(null);
        setError("This account is not authorized for administration.");
      }
    });
  }, []);
  useEffect(() => {
    if (!profile) return;
    Promise.all([
      getDocs(query(collection(db, "categories"), orderBy("name"))),
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"))),
    ])
      .then(([cat, people, incident]) => {
        setCategories(
          cat.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setUsers(people.docs.map((item) => ({ id: item.id, ...item.data() })));
        setReports(
          incident.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
      })
      .catch((reason) => setError(errorText(reason)));
  }, [profile]);
  const login = async (email, password) => {
    if (!isFirebaseConfigured)
      return setError("Firebase is not configured yet.");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("Sign-in failed. Check your authorized email and password.");
    }
  };
  const updateStatus = async (reportId, status) => {
    try {
      const target = reports.find((item) => item.id === reportId);
      const nextTimeline = Array.isArray(target?.timeline)
        ? [
            ...target.timeline,
            {
              label: `Status updated to ${status}`,
              status,
              timestamp: new Date().toISOString(),
              note: `Admin updated the case to ${status}`,
            },
          ]
        : [
            {
              label: `Status updated to ${status}`,
              status,
              timestamp: new Date().toISOString(),
              note: `Admin updated the case to ${status}`,
            },
          ];

      await updateDoc(doc(db, "reports", reportId), {
        status,
        updatedAt: serverTimestamp(),
        timeline: nextTimeline,
      });
      setReports(
        reports.map((item) =>
          item.id === reportId ? { ...item, status, timeline: nextTimeline } : item,
        ),
      );
      setMessage("Report status updated.");
    } catch (reason) {
      setError(errorText(reason));
    }
  };
  if (!isFirebaseConfigured || !profile)
    return (
      <Shell admin>
        <main>
          {!isFirebaseConfigured ? (
            <div className="setup-state">
              <h1>Firebase setup required</h1>
              <p>
                Add your Firebase environment values before using the
                administrator portal.
              </p>
            </div>
          ) : (
            <AdminLogin onLogin={login} error={error} />
          )}
        </main>
      </Shell>
    );
  return (
    <Shell admin>
      <main>
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">System administration</p>
            <h1>Good day, {profile.name || profile.email.split("@")[0]}.</h1>
          </div>
          <div className="user-chip">
            {profile.email} ·{" "}
            <button className="logout" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        </div>
        <div className="dashboard-grid">
          <div className="stat">
            <small>All reports</small>
            <strong>{reports.length}</strong>
          </div>
          <div className="stat">
            <small>Needs attention</small>
            <strong>
              {reports.filter((item) => item.status === "Received").length}
            </strong>
          </div>
          <div className="stat">
            <small>Categories</small>
            <strong>{categories.length}</strong>
          </div>
        </div>
        <div className="admin-layout">
          <div className="dashboard-table">
            <div className="table-title">All routed reports</div>
            {reports.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Issue</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((item) => {
                    const priority = item.priority === "Urgent" ? "Critical" : (item.priority || "Normal");
                    const priorityClass = priority.toLowerCase().replace(/\s+/g, "-");
                    const timelineEvents = Array.isArray(item.timeline) && item.timeline.length
                      ? item.timeline.slice(-3)
                      : [{ label: "Report logged", note: "Report received in the system" }];
                    return (
                      <tr key={item.id}>
                        <td>{item.reference}</td>
                        <td>
                          <strong>{item.title}</strong>
                          <br />
                          <small>{item.location}</small>
                          <div className="timeline-inline">
                            {timelineEvents.map((event, index) => (
                              <div className="timeline-inline-item" key={`${item.id}-admin-${index}`}>
                                <span className="timeline-inline-dot" />
                                <span>{event.label || event.status || "Update"}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          <span className={`priority ${priorityClass}`}>
                            {priority}
                          </span>
                        </td>
                        <td>
                          <select
                            className="status-select"
                            value={item.status}
                            onChange={(event) =>
                              updateStatus(item.id, event.target.value)
                            }
                          >
                            <option>Received</option>
                            <option>In review</option>
                            <option>Actioned</option>
                            <option>Closed</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">No reports have been received.</div>
            )}
          </div>
          <AdminControls
            categories={categories}
            setCategories={setCategories}
            users={users}
            setUsers={setUsers}
            setMessage={setMessage}
          />
        </div>
      </main>
      <div className={`toast ${message ? "show" : ""}`} role="status">
        {message}
      </div>
    </Shell>
  );
}

function AdminControls({
  categories,
  setCategories,
  users,
  setUsers,
  setMessage,
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const category = categories.find((item) => item.id === categoryId);
  const [email, setEmail] = useState(category?.email || "");
  useEffect(() => setEmail(category?.email || ""), [category]);
  const saveRouting = async (event) => {
    event.preventDefault();
    await updateDoc(doc(db, "categories", categoryId), { email });
    setCategories(
      categories.map((item) =>
        item.id === categoryId ? { ...item, email } : item,
      ),
    );
    setMessage("Routing email updated.");
  };
  const addCategory = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get("name");
    const emailValue = data.get("email");
    const saved = await addDoc(collection(db, "categories"), {
      name,
      email: emailValue,
    });
    setCategories([...categories, { id: saved.id, name, email: emailValue }]);
    event.currentTarget.reset();
    setMessage("Category added.");
  };
  const addUser = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const emailValue = data.get("email");
    try {
      const userId = await createDepartmentAccount(
        emailValue,
        data.get("password"),
      );
      const user = {
        name: data.get("name"),
        email: emailValue,
        role: "Department Officer",
        categoryIds: [data.get("categoryId")],
      };
      await setDoc(doc(db, "users", userId), user);
      setUsers([...users, { id: userId, ...user }]);
      event.currentTarget.reset();
      setMessage(
        "Department account created. The user can now sign in with this email and password.",
      );
    } catch (reason) {
      setMessage(errorText(reason));
    }
  };
  const updateUserAccess = async (userId, nextCategoryId) => {
    if (!nextCategoryId) return;
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    const nextUser = { ...user, categoryIds: [nextCategoryId] };
    await setDoc(doc(db, "users", userId), nextUser);
    setUsers(
      users.map((item) => (item.id === userId ? { ...item, ...nextUser } : item)),
    );
    setMessage("Department access updated.");
  };
  const removeUser = async (userId) => {
    await deleteDoc(doc(db, "users", userId));
    setUsers(users.filter((item) => item.id !== userId));
    setMessage("Department account removed.");
  };
  return (
    <div className="admin-card admin-right-panel">
      <h3>Routing & access</h3>
      <p className="field-hint">Update the responsible email for a category.</p>
      <form onSubmit={saveRouting}>
        <label>
          Category
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notification email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>
        <button className="primary-button" type="submit">
          Save routing <span>→</span>
        </button>
      </form>
      <p className="field-hint admin-label">Add a category</p>
      <form onSubmit={addCategory}>
        <label>
          Department name
          <input name="name" required placeholder="e.g. Housing" />
        </label>
        <label>
          Notification email
          <input
            name="email"
            type="email"
            required
            placeholder="housing@civicalert.gov"
          />
        </label>
        <button className="outline-button" type="submit">
          + Add category
        </button>
      </form>
      <p className="field-hint admin-label">Department accounts</p>
      {users
        .filter((item) => item.role !== "System Administrator")
        .map((item) => (
          <div className="user-row user-edit-row" key={item.id}>
            <span>
              {item.name}
              <small>{item.email}</small>
            </span>
            <label className="mini-field">
              <small>Category</small>
              <select
                value={item.categoryIds?.[0] || ""}
                onChange={(event) =>
                  updateUserAccess(item.id, event.target.value)
                }
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="user-actions">
              <button
                className="outline-button small-button"
                type="button"
                onClick={() => updateUserAccess(item.id, item.categoryIds?.[0])}
              >
                Save
              </button>
              <button
                className="text-button danger-button"
                type="button"
                onClick={() => removeUser(item.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      <form onSubmit={addUser}>
        <label>
          User name
          <input name="name" required placeholder="Full name" />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="name@civicalert.gov"
          />
        </label>
        <label>
          Temporary password
          <input
            name="password"
            type="password"
            minLength="6"
            required
            placeholder="At least 6 characters"
          />
        </label>
        <label>
          Assign category
          <select name="categoryId">
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button className="outline-button" type="submit">
          + Create department account
        </button>
      </form>
    </div>
  );
}

function App() {
  const isAdminPath =
    window.location.pathname.replace(/\/$/, "") === "/incidentreports/admin";
  return isAdminPath ? <Portal /> : <PublicApp />;
}
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
