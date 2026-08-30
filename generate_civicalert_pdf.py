from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.lib.colors import HexColor
from datetime import datetime
import os


# ============================================================
# CONFIGURATION
# ============================================================

OUTPUT_FILE = "CivicAlert_Full_System_Architecture_and_Build_Plan.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4

NAVY = HexColor("#12355B")
BLUE = HexColor("#1769AA")
LIGHT_BLUE = HexColor("#EAF4FB")
GREEN = HexColor("#16855B")
LIGHT_GREEN = HexColor("#E8F7F0")
RED = HexColor("#C62828")
LIGHT_RED = HexColor("#FDECEC")
ORANGE = HexColor("#EF8B22")
LIGHT_ORANGE = HexColor("#FFF3E5")
DARK = HexColor("#20242A")
GRAY = HexColor("#667085")
LIGHT_GRAY = HexColor("#F2F4F7")
BORDER = HexColor("#D0D5DD")
WHITE = colors.white


# ============================================================
# DOCUMENT
# ============================================================

doc = SimpleDocTemplate(
    OUTPUT_FILE,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=18 * mm,
    title="CivicAlert - Full System Architecture and Build Plan",
    author="CivicAlert Project",
    subject="Government Incident Reporting and Emergency SOS System"
)


# ============================================================
# STYLES
# ============================================================

styles = getSampleStyleSheet()

styles.add(ParagraphStyle(
    name="CoverTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=30,
    leading=36,
    textColor=NAVY,
    alignment=TA_CENTER,
    spaceAfter=10
))

styles.add(ParagraphStyle(
    name="CoverSubtitle",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=15,
    leading=21,
    textColor=GRAY,
    alignment=TA_CENTER,
    spaceAfter=15
))

styles.add(ParagraphStyle(
    name="H1Custom",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=19,
    leading=24,
    textColor=NAVY,
    spaceBefore=12,
    spaceAfter=9
))

styles.add(ParagraphStyle(
    name="H2Custom",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=BLUE,
    spaceBefore=10,
    spaceAfter=6
))

styles.add(ParagraphStyle(
    name="H3Custom",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=15,
    textColor=DARK,
    spaceBefore=7,
    spaceAfter=4
))

styles.add(ParagraphStyle(
    name="BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.5,
    leading=14,
    textColor=DARK,
    spaceAfter=6
))

styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=GRAY
))

styles.add(ParagraphStyle(
    name="CodeCustom",
    parent=styles["Normal"],
    fontName="Courier",
    fontSize=7.3,
    leading=10,
    textColor=DARK,
    backColor=LIGHT_GRAY,
    borderColor=BORDER,
    borderWidth=0.5,
    borderPadding=7,
    spaceBefore=5,
    spaceAfter=8
))

styles.add(ParagraphStyle(
    name="Callout",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=13,
    textColor=NAVY,
    backColor=LIGHT_BLUE,
    borderColor=BLUE,
    borderWidth=0.7,
    borderPadding=8,
    spaceBefore=6,
    spaceAfter=8
))


# ============================================================
# HELPERS
# ============================================================

def P(text, style="BodyCustom"):
    return Paragraph(text, styles[style])


def code(text):
    return Paragraph(
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>"),
        styles["CodeCustom"]
    )


def bullet(text):
    return Paragraph("• " + text, styles["BodyCustom"])


def numbered(n, text):
    return Paragraph(f"<b>{n}.</b> {text}", styles["BodyCustom"])


def section(title):
    return [P(title, "H1Custom")]


def subsection(title):
    return P(title, "H2Custom")


def make_table(data, widths=None, header=True, font_size=7.7):
    converted = []

    for row in data:
        converted_row = []
        for cell in row:
            if isinstance(cell, Paragraph):
                converted_row.append(cell)
            else:
                converted_row.append(
                    Paragraph(str(cell), ParagraphStyle(
                        f"table_{font_size}",
                        parent=styles["Small"],
                        fontSize=font_size,
                        leading=font_size + 2,
                        textColor=DARK
                    ))
                )
        converted.append(converted_row)

    table = Table(converted, colWidths=widths, repeatRows=1 if header else 0)
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]

    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]

        for r in range(1, len(converted)):
            if r % 2 == 0:
                commands.append(
                    ("BACKGROUND", (0, r), (-1, r), LIGHT_GRAY)
                )

    table.setStyle(TableStyle(commands))
    return table


# ============================================================
# ARCHITECTURE DIAGRAM HELPERS
# ============================================================

def box(d, x, y, w, h, text, fill=LIGHT_BLUE, stroke=BLUE, font=8.5):
    d.add(Rect(
        x, y, w, h,
        rx=5, ry=5,
        fillColor=fill,
        strokeColor=stroke,
        strokeWidth=1
    ))

    lines = text.split("\n")
    total_height = len(lines) * (font + 2)
    start_y = y + h / 2 + total_height / 2 - font

    for i, line in enumerate(lines):
        d.add(String(
            x + w / 2,
            start_y - i * (font + 2),
            line,
            fontName="Helvetica-Bold",
            fontSize=font,
            fillColor=DARK,
            textAnchor="middle"
        ))


def arrow(d, x1, y1, x2, y2, color=NAVY):
    d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.2))

    # Simple arrow head
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    length = 6
    width = 3

    p1 = (
        x2 - length * math.cos(angle) + width * math.sin(angle),
        y2 - length * math.sin(angle) - width * math.cos(angle)
    )
    p2 = (
        x2 - length * math.cos(angle) - width * math.sin(angle),
        y2 - length * math.sin(angle) + width * math.cos(angle)
    )

    d.add(Polygon(
        points=[x2, y2, p1[0], p1[1], p2[0], p2[1]],
        fillColor=color,
        strokeColor=color
    ))


def architecture_diagram():
    d = Drawing(520, 430)

    box(d, 180, 375, 160, 35, "CITIZENS", fill=LIGHT_GREEN, stroke=GREEN)

    box(d, 50, 300, 140, 45, "WEB PORTAL\nIncident Reporting")
    box(d, 330, 300, 140, 45, "MOBILE APP\nIncident + SOS")

    arrow(d, 230, 375, 120, 345)
    arrow(d, 290, 375, 400, 345)

    box(d, 170, 220, 180, 50,
        "BACKEND API\nAuthentication • Reports • SOS • Routing",
        fill=LIGHT_BLUE, stroke=BLUE)

    arrow(d, 120, 300, 220, 270)
    arrow(d, 400, 300, 300, 270)

    box(d, 25, 125, 125, 50, "POSTGRESQL\n+ POSTGIS",
        fill=LIGHT_GRAY, stroke=GRAY)
    box(d, 200, 125, 125, 50, "OBJECT STORAGE\nPhotos / Files",
        fill=LIGHT_GRAY, stroke=GRAY)
    box(d, 375, 125, 125, 50, "REDIS / QUEUE\nBackground Jobs",
        fill=LIGHT_GRAY, stroke=GRAY)

    arrow(d, 205, 220, 90, 175)
    arrow(d, 260, 220, 260, 175)
    arrow(d, 315, 220, 435, 175)

    box(d, 20, 30, 105, 45, "EMAIL")
    box(d, 145, 30, 105, 45, "SMS")
    box(d, 270, 30, 105, 45, "CALL")
    box(d, 395, 30, 105, 45, "EMERGENCY\nCONTACT")

    arrow(d, 435, 125, 72, 75)
    arrow(d, 435, 125, 197, 75)
    arrow(d, 435, 125, 322, 75)
    arrow(d, 435, 125, 447, 75)

    return d


def incident_flow_diagram():
    d = Drawing(520, 500)

    labels = [
        ("1", "Open App", 425),
        ("2", "Select Category", 365),
        ("3", "Description", 305),
        ("4", "Location / GPS", 245),
        ("5", "Attach Evidence", 185),
        ("6", "Anonymous / Identified", 125),
        ("7", "Review + Submit", 65),
    ]

    for i, text, y in labels:
        box(d, 170, y, 180, 35, f"{i}. {text}")
        if y > 65:
            arrow(d, 260, y, 260, y - 25)

    box(d, 370, 245, 130, 50, "Routing Engine\nArea + Category",
        fill=LIGHT_GREEN, stroke=GREEN)
    arrow(d, 350, 262, 370, 270)

    box(d, 370, 145, 130, 50, "Responsible\nAuthority",
        fill=LIGHT_GREEN, stroke=GREEN)
    arrow(d, 435, 245, 435, 195)

    box(d, 370, 65, 130, 50, "Email Notification",
        fill=LIGHT_BLUE, stroke=BLUE)
    arrow(d, 435, 145, 435, 115)

    return d


def sos_flow_diagram():
    d = Drawing(520, 520)

    steps = [
        ("POWER BUTTON ×3", 445, LIGHT_RED, RED),
        ("Within 1 second", 385, LIGHT_RED, RED),
        ("5-second cancellation window", 325, LIGHT_ORANGE, ORANGE),
        ("Acquire GPS + device metadata", 265, LIGHT_BLUE, BLUE),
        ("Create SOS record", 205, LIGHT_BLUE, BLUE),
        ("Notification Queue", 145, LIGHT_BLUE, BLUE),
    ]

    for idx, (text, y, fill, stroke) in enumerate(steps):
        box(d, 150, y, 220, 38, text, fill=fill, stroke=stroke)
        if idx < len(steps) - 1:
            arrow(d, 260, y, 260, y - 22)

    box(d, 30, 45, 130, 45, "EMAIL\nEmergency Contact")
    box(d, 195, 45, 130, 45, "SMS\nEmergency Contact")
    box(d, 360, 45, 130, 45, "CALL\nEmergency Contact")

    arrow(d, 210, 145, 95, 90)
    arrow(d, 260, 145, 260, 90)
    arrow(d, 310, 145, 425, 90)

    return d


def database_diagram():
    d = Drawing(520, 430)

    box(d, 195, 350, 130, 45, "USERS\nid • role • name")
    box(d, 30, 250, 145, 65, "REPORTS\nid • category • status\nlocation • reporter")
    box(d, 345, 250, 145, 65, "CATEGORIES\nid • name • priority")
    box(d, 30, 130, 145, 65, "ATTACHMENTS\nfile • type • size\nstorage key")
    box(d, 345, 130, 145, 65, "AUTHORITIES\ndepartment • email\narea")
    box(d, 195, 25, 130, 65, "SOS_EVENTS\nlocation • trigger\nstatus • contact")

    arrow(d, 230, 350, 105, 315)
    arrow(d, 290, 350, 415, 315)
    arrow(d, 105, 250, 105, 195)
    arrow(d, 175, 280, 345, 280)
    arrow(d, 415, 250, 415, 195)
    arrow(d, 175, 150, 195, 90)
    arrow(d, 345, 150, 325, 90)

    return d


# ============================================================
# HEADER / FOOTER
# ============================================================

def add_page_number(canvas, doc):
    canvas.saveState()

    canvas.setStrokeColor(BORDER)
    canvas.line(
        18 * mm,
        12 * mm,
        PAGE_WIDTH - 18 * mm,
        12 * mm
    )

    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY)

    canvas.drawString(
        18 * mm,
        7 * mm,
        "CivicAlert — Government Incident Reporting & Emergency SOS System"
    )

    canvas.drawRightString(
        PAGE_WIDTH - 18 * mm,
        7 * mm,
        f"Page {doc.page}"
    )

    canvas.restoreState()


# ============================================================
# DOCUMENT CONTENT
# ============================================================

story = []


# COVER
story.append(Spacer(1, 35 * mm))
story.append(P("CIVICALERT", "CoverTitle"))
story.append(P(
    "Government Incident Reporting & Emergency SOS System",
    "CoverSubtitle"
))

story.append(Spacer(1, 10 * mm))

cover_box = Table([
    [P("<b>FULL SYSTEM ARCHITECTURE</b>", "BodyCustom")],
    [P("Software Architecture • Database • API • Security • "
       "Mobile • Web • SOS • Notifications • Deployment • Testing", "Small")]
], colWidths=[145 * mm])

cover_box.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BLUE),
    ("BOX", (0, 0), (-1, -1), 1, BLUE),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
]))

story.append(cover_box)
story.append(Spacer(1, 15 * mm))

story.append(P(
    "Prepared as a complete implementation blueprint for a government "
    "incident-reporting platform supporting anonymous reporting, "
    "geolocation, evidence uploads, authority routing, and emergency SOS.",
    "BodyCustom"
))

story.append(Spacer(1, 20 * mm))

story.append(P(
    f"Document Version: 1.0<br/>"
    f"Generated: {datetime.now().strftime('%d %B %Y')}<br/>"
    f"Status: Architecture & Build Specification",
    "Small"
))

story.append(PageBreak())


# TABLE OF CONTENTS
story += section("Table of Contents")

toc = [
    ["#", "Section"],
    ["1", "Project Overview"],
    ["2", "System Scope"],
    ["3", "User Roles"],
    ["4", "Complete System Architecture"],
    ["5", "Citizen Incident Reporting Flow"],
    ["6", "SOS Architecture and Flow"],
    ["7", "Authority Routing Architecture"],
    ["8", "Location and Mapping Architecture"],
    ["9", "File Upload Architecture"],
    ["10", "Identity, Anonymous Reporting and IP Metadata"],
    ["11", "Notification Architecture"],
    ["12", "Government Administration Portal"],
    ["13", "Database Architecture"],
    ["14", "API Architecture"],
    ["15", "Security Architecture"],
    ["16", "Offline and Mobile Architecture"],
    ["17", "Deployment Architecture"],
    ["18", "Monitoring and Operations"],
    ["19", "Testing Strategy"],
    ["20", "Development Roadmap"],
    ["21", "MVP Definition"],
    ["22", "Production Readiness Checklist"],
]

story.append(make_table(toc, widths=[15 * mm, 145 * mm]))
story.append(PageBreak())


# 1
story += section("1. Project Overview")

story.append(P(
    "<b>CivicAlert</b> is a government incident-reporting and emergency "
    "response platform. Citizens can submit public incidents using a web "
    "portal or mobile application. Reports can include descriptions, "
    "photos, documents, geographic coordinates and other supporting data."
))

story.append(P(
    "The platform automatically determines the responsible government "
    "authority using the incident category and geographic administrative "
    "area. The report is then routed to the appropriate department and "
    "notification is delivered through email."
))

story.append(P(
    "The mobile application additionally provides an SOS mechanism. "
    "When the supported device-level SOS trigger is activated, the "
    "application creates an emergency event and attempts to notify the "
    "configured emergency contact by email, SMS and phone call."
))

story.append(P(
    "The system is designed around security, auditability, privacy, "
    "geographic data, notification reliability and government workflow "
    "management."
))


# 2
story += section("2. System Scope")

scope_data = [
    ["Area", "Capabilities"],
    ["Citizen Web", "Incident reporting, anonymous/identified mode, location, attachments, tracking."],
    ["Citizen Mobile", "Incident reporting, GPS, camera, emergency contacts, SOS."],
    ["Government Portal", "Reports, assignments, departments, authority routing, SOS monitoring, analytics."],
    ["Backend", "REST API, authentication, routing, notification orchestration, audit."],
    ["Database", "PostgreSQL + PostGIS for relational and geographic data."],
    ["Storage", "Private object storage for photos, videos and documents."],
    ["Notifications", "Email, SMS and phone-call integrations."],
    ["Queue", "Redis-backed asynchronous processing for notifications and heavy jobs."],
    ["Security", "RBAC, MFA for administrators, encryption, audit logs, rate limiting."],
]

story.append(make_table(scope_data, widths=[35 * mm, 125 * mm]))


# 3
story += section("3. User Roles")

roles = [
    ["Role", "Responsibilities"],
    ["Citizen", "Submit incidents, track reports, manage emergency contact, trigger SOS."],
    ["Department Officer", "Review assigned reports, update status, add notes, take action."],
    ["Department Administrator", "Manage department officers and routing information."],
    ["System Administrator", "Manage users, departments, authorities, categories, configuration and audit."],
]

story.append(make_table(roles, widths=[45 * mm, 115 * mm]))


# 4
story += section("4. Complete System Architecture")
story.append(P(
    "The system is separated into presentation, application, data, "
    "notification and administration layers. The mobile application "
    "provides device-specific functionality while the web application "
    "provides browser-based reporting and tracking."
))

story.append(architecture_diagram())
story.append(Spacer(1, 8))
story.append(P(
    "<b>Architecture principle:</b> the client applications must never "
    "contain database credentials, email credentials, SMS credentials, "
    "calling-provider secrets or authority-routing secrets. All privileged "
    "operations pass through the backend API.",
    "Callout"
))


# 5
story += section("5. Citizen Incident Reporting Flow")

story.append(incident_flow_diagram())

story.append(P(
    "A report begins as a draft and becomes a permanent incident record "
    "only after successful server-side validation. The server generates "
    "the reference number rather than trusting a client-generated ID."
))

incident_steps = [
    ["Step", "Action"],
    ["1", "Citizen opens the application."],
    ["2", "Citizen selects an incident category."],
    ["3", "Citizen enters title and description."],
    ["4", "Citizen captures GPS location or manually selects a map point."],
    ["5", "Citizen optionally attaches photos, video or documents."],
    ["6", "Citizen chooses anonymous or identified reporting."],
    ["7", "System validates and stores the report."],
    ["8", "Routing engine determines responsible authority."],
    ["9", "Notification job is queued."],
    ["10", "Authority email is sent and delivery result recorded."],
    ["11", "Citizen receives report reference number."],
]

story.append(make_table(incident_steps, widths=[18 * mm, 142 * mm]))


# 6
story += section("6. SOS Architecture and Flow")

story.append(P(
    "SOS is an emergency workflow and should be isolated from ordinary "
    "incident processing. The mobile application initiates the SOS event, "
    "while the backend coordinates notification delivery."
))

story.append(sos_flow_diagram())

story.append(P(
    "<b>Important implementation constraint:</b> a standard web browser "
    "cannot reliably detect physical power-button presses. The requested "
    "three-press trigger therefore belongs in the mobile application and "
    "must be implemented/tested against the supported operating system and "
    "device APIs. The backend should expose a testable SOS endpoint so the "
    "entire notification pipeline can be developed independently of the "
    "device trigger.",
    "Callout"
))

sos_data = [
    ["Stage", "System Behavior"],
    ["Trigger", "Supported mobile-device SOS mechanism detects the configured trigger."],
    ["Debounce", "Three presses must occur within the configured time window."],
    ["Cancellation", "A short cancellation window reduces accidental activation."],
    ["Location", "Application attempts to acquire current location."],
    ["Record", "Backend creates a unique SOS reference."],
    ["Queue", "Notification jobs are created independently."],
    ["Email", "Emergency-contact email is attempted."],
    ["SMS", "Emergency-contact SMS is attempted."],
    ["Call", "Emergency-contact phone call is attempted."],
    ["Audit", "Each notification result is recorded."],
]

story.append(make_table(sos_data, widths=[35 * mm, 125 * mm]))

story.append(P(
    "Notification channels must be independent. A failed email must not "
    "prevent the SMS or phone call from being attempted."
))


# 7
story += section("7. Authority Routing Architecture")

story.append(P(
    "Authority routing should be database-driven. Government administrators "
    "must be able to update responsible departments and contact addresses "
    "without requiring a software deployment."
))

routing = [
    ["Input", "Processing", "Output"],
    ["GPS coordinates", "Administrative boundary lookup", "Province / district / municipality / ward"],
    ["Incident category", "Routing rule lookup", "Responsible department"],
    ["Area + department", "Authority lookup", "Email / phone / notification destination"],
]

story.append(make_table(routing, widths=[45 * mm, 65 * mm, 50 * mm]))

story.append(code(
    "GPS Coordinates\n"
    "      ↓\n"
    "Administrative Boundary\n"
    "      ↓\n"
    "Municipality / Ward\n"
    "      ↓\n"
    "Incident Category\n"
    "      ↓\n"
    "Routing Rule\n"
    "      ↓\n"
    "Responsible Authority\n"
    "      ↓\n"
    "Notification"
))


# 8
story += section("8. Location and Mapping Architecture")

story.append(P(
    "Location data is a core system capability. The mobile application "
    "should request location permission only when needed and should clearly "
    "explain why the location is being collected."
))

location_data = [
    ["Field", "Purpose"],
    ["latitude", "Geographic latitude."],
    ["longitude", "Geographic longitude."],
    ["accuracy", "Reported GPS accuracy in meters when available."],
    ["address", "Human-readable address."],
    ["administrative_area", "Resolved government administrative area."],
    ["captured_at", "Time at which location was captured."],
]

story.append(make_table(location_data, widths=[45 * mm, 115 * mm]))

story.append(P(
    "PostGIS should be used for geographic queries, including determining "
    "which administrative boundary contains a submitted coordinate and "
    "supporting map-based incident analysis."
))


# 9
story += section("9. File Upload Architecture")

story.append(code(
    "Client\n"
    "  ↓\n"
    "Upload API\n"
    "  ↓\n"
    "Authentication + authorization\n"
    "  ↓\n"
    "Extension / MIME / content validation\n"
    "  ↓\n"
    "File-size validation\n"
    "  ↓\n"
    "Malware scanning\n"
    "  ↓\n"
    "Random server-side filename\n"
    "  ↓\n"
    "Private object storage\n"
    "  ↓\n"
    "Attachment database record"
))

file_data = [
    ["Requirement", "Implementation"],
    ["File types", "Explicit allowlist of supported image/video/document types."],
    ["File size", "Server-side maximum size."],
    ["Filename", "Generate random storage keys; never trust user filenames."],
    ["Storage", "Private object storage, not publicly accessible."],
    ["Access", "Short-lived authorized download URLs or backend proxy."],
    ["Security", "Validate actual content and scan where infrastructure permits."],
]

story.append(make_table(file_data, widths=[40 * mm, 120 * mm]))


# 10
story += section("10. Identity, Anonymous Reporting and IP Metadata")

story.append(P(
    "Citizens may report anonymously or provide their identity. Anonymous "
    "reporting means the reporter's name, email and phone number are not "
    "included in the authority-facing report."
))

identity_data = [
    ["Mode", "Citizen Data", "Authority View"],
    ["Anonymous", "No identity fields required", "Anonymous"],
    ["Identified", "Name, phone, email where provided", "Reporter identity according to permissions"],
]

story.append(make_table(identity_data, widths=[30 * mm, 70 * mm, 60 * mm]))

story.append(P(
    "The system may retain technical metadata such as IP address, user-agent, "
    "session/device identifiers and timestamps for security, abuse prevention "
    "and audit purposes where legally permitted."
))

story.append(P(
    "<b>IP addresses must not be treated as a reliable identity.</b> "
    "Mobile carriers, NAT, VPNs, shared networks and changing addresses "
    "can result in multiple users sharing an IP or one user changing IPs."
))

story.append(code(
    "Request\n"
    "  ├── Report data\n"
    "  ├── IP address\n"
    "  ├── User-Agent\n"
    "  ├── Session / device identifier\n"
    "  └── Timestamp\n"
    "          ↓\n"
    "Secure technical audit metadata"
))


# 11
story += section("11. Notification Architecture")

story.append(P(
    "Email, SMS and calling should be implemented behind a common notification "
    "service. Asynchronous queues should be used for notifications so an "
    "external provider failure does not block the main report transaction."
))

notification_data = [
    ["Notification", "Normal Report", "SOS"],
    ["Email", "Responsible authority", "Emergency contact"],
    ["SMS", "Optional", "Emergency contact"],
    ["Call", "No", "Emergency contact"],
]

story.append(make_table(notification_data, widths=[50 * mm, 55 * mm, 55 * mm]))

story.append(code(
    "Application\n"
    "    ↓\n"
    "Notification Service\n"
    "    ↓\n"
    "Redis / Job Queue\n"
    "    ↓\n"
    "┌──────────┬──────────┬──────────┐\n"
    "│  Email   │   SMS    │   Call   │\n"
    "└──────────┴──────────┴──────────┘\n"
    "    ↓\n"
    "Delivery Status + Audit"
))


# 12
story += section("12. Government Administration Portal")

admin_features = [
    ["Module", "Features"],
    ["Dashboard", "Total reports, pending, in progress, resolved, active SOS."],
    ["Reports", "Search, filtering, assignment, status changes, notes."],
    ["Map", "Incident markers, filters, geographic analysis."],
    ["SOS", "Active SOS events, notification status, location."],
    ["Authorities", "Departments, contact addresses, areas."],
    ["Routing", "Category + geographic routing rules."],
    ["Users", "Officer and administrator management."],
    ["Analytics", "Category, area, response and resolution statistics."],
    ["Audit", "Security and administrative activity logs."],
]

story.append(make_table(admin_features, widths=[40 * mm, 120 * mm]))

story.append(P(
    "Government users should only see information required for their role. "
    "For example, ordinary department officers should not automatically "
    "receive unrestricted access to sensitive technical metadata."
))


# 13
story += section("13. Database Architecture")

story.append(database_diagram())
story.append(Spacer(1, 8))

db_tables = [
    ["Table", "Important Fields"],
    ["users", "id, role_id, name, email, phone, password_hash, status"],
    ["roles", "id, name"],
    ["reports", "id, reference_number, user_id, anonymous, category_id, title, description, location, priority, status, authority_id"],
    ["incident_categories", "id, name, description, icon, default_priority, active"],
    ["authorities", "id, name, department, email, phone, area, active"],
    ["attachments", "id, report_id, file_name, storage_key, mime_type, file_size"],
    ["report_status_history", "id, report_id, old_status, new_status, changed_by, note, created_at"],
    ["emergency_contacts", "id, user_id, name, phone, email, relationship, is_primary"],
    ["sos_events", "id, reference_number, user_id, device_id, ip_address, latitude, longitude, trigger_type, contact_id, status"],
    ["sos_notifications", "id, sos_id, type, recipient, status, provider_reference, sent_at"],
    ["audit_logs", "id, user_id, action, entity_type, entity_id, ip_address, created_at"],
]

story.append(make_table(db_tables, widths=[50 * mm, 110 * mm], font_size=7.2))


# 14
story += section("14. API Architecture")

api_data = [
    ["Method", "Endpoint", "Purpose"],
    ["POST", "/api/auth/register", "Create citizen account"],
    ["POST", "/api/auth/login", "Authenticate"],
    ["POST", "/api/reports", "Create incident report"],
    ["GET", "/api/reports/:id", "Get report"],
    ["GET", "/api/reports", "List permitted reports"],
    ["PATCH", "/api/reports/:id", "Update report"],
    ["POST", "/api/reports/:id/attachments", "Upload evidence"],
    ["POST", "/api/reports/:id/status", "Change status"],
    ["GET", "/api/categories", "List incident categories"],
    ["GET", "/api/authorities", "List authorities"],
    ["GET", "/api/emergency-contact", "Get emergency contact"],
    ["POST", "/api/emergency-contact", "Create emergency contact"],
    ["PATCH", "/api/emergency-contact", "Update emergency contact"],
    ["POST", "/api/sos", "Create SOS event"],
    ["GET", "/api/sos/:id", "Get SOS event"],
    ["POST", "/api/sos/:id/cancel", "Cancel SOS where permitted"],
    ["GET", "/api/admin/dashboard", "Admin dashboard"],
    ["GET", "/api/admin/reports", "Administrative report list"],
    ["GET", "/api/admin/sos", "Administrative SOS list"],
    ["GET", "/api/admin/audit-logs", "Audit records"],
]

story.append(make_table(api_data, widths=[20 * mm, 75 * mm, 65 * mm], font_size=7.0))


# 15
story += section("15. Security Architecture")

security_items = [
    "TLS/HTTPS for all client-to-server communication.",
    "Password hashing using a modern password-hashing algorithm.",
    "Short-lived access tokens and secure refresh-token handling.",
    "Multi-factor authentication for government administrators.",
    "Role-based access control on every protected backend operation.",
    "Server-side validation of all user input.",
    "Parameterized database queries / ORM protections.",
    "CSRF protection where cookie-based authentication is used.",
    "Rate limiting on authentication, reporting and SOS endpoints.",
    "Strict file-upload validation and private file storage.",
    "Secrets stored in environment/secret-management infrastructure, never source code.",
    "Audit logging for administrative and sensitive operations.",
    "Encryption at rest for sensitive data where supported.",
    "Database backups with access controls.",
    "Data-retention and deletion policies.",
    "Security monitoring and incident-response procedures.",
]

for item in security_items:
    story.append(bullet(item))

story.append(P(
    "<b>Security priority:</b> anonymous reporting, location data, IP metadata, "
    "emergency contacts and government administrative data should be treated "
    "as sensitive information and protected using least-privilege access."
))


# 16
story += section("16. Offline and Mobile Architecture")

story.append(code(
    "Mobile App\n"
    "    ↓\n"
    "Network Available?\n"
    "    ├── YES → Submit to API\n"
    "    │\n"
    "    └── NO → Secure Local Queue\n"
    "                 ↓\n"
    "          Connection Restored\n"
    "                 ↓\n"
    "             Synchronize\n"
    "                 ↓\n"
    "              Backend"
))

story.append(P(
    "Ordinary incident reports may be stored locally while offline and "
    "uploaded when connectivity returns. Emergency behavior must clearly "
    "report which notification channels succeeded or failed."
))

mobile_features = [
    ["Feature", "Mobile Responsibility"],
    ["GPS", "Request permission, capture coordinates and accuracy."],
    ["Camera", "Capture evidence directly."],
    ["Storage", "Securely queue unsent data where necessary."],
    ["SOS", "Initiate supported device-level emergency trigger."],
    ["Contacts", "Store/manage configured emergency contact."],
    ["Notifications", "Display report and SOS delivery status."],
]

story.append(make_table(mobile_features, widths=[40 * mm, 120 * mm]))


# 17
story += section("17. Deployment Architecture")

story.append(code(
    "Internet\n"
    "   ↓\n"
    "WAF / Firewall\n"
    "   ↓\n"
    "Load Balancer\n"
    "   ↓\n"
    "Web Frontend + API\n"
    "   ↓\n"
    "Application Services\n"
    "   ├── PostgreSQL + PostGIS\n"
    "   ├── Redis\n"
    "   ├── Object Storage\n"
    "   └── Background Workers\n"
    "          ├── Email\n"
    "          ├── SMS\n"
    "          └── Call"
))

deployment = [
    ["Component", "Purpose"],
    ["WAF / Firewall", "Protect public application endpoints."],
    ["Load Balancer", "Distribute traffic across application instances."],
    ["Web Frontend", "Serve citizen and administrative interfaces."],
    ["API", "Business logic and secure data access."],
    ["PostgreSQL/PostGIS", "Transactional and geographic data."],
    ["Redis", "Queue, caching and short-lived coordination."],
    ["Object Storage", "Private evidence/file storage."],
    ["Workers", "Asynchronous email, SMS, call and processing jobs."],
    ["Monitoring", "Logs, metrics, errors and service health."],
    ["Backup", "Database and object-storage backup/recovery."],
]

story.append(make_table(deployment, widths=[45 * mm, 115 * mm]))


# 18
story += section("18. Monitoring and Operations")

monitoring = [
    "API availability and response time.",
    "Database health and connection utilization.",
    "Queue length and failed jobs.",
    "Email delivery failures.",
    "SMS delivery failures.",
    "Call initiation failures.",
    "SOS processing time.",
    "Authentication failures.",
    "Suspicious activity and rate-limit events.",
    "Storage usage.",
    "Backup success/failure.",
]

for item in monitoring:
    story.append(bullet(item))

story.append(P(
    "SOS processing should be observable end-to-end: SOS received, record "
    "created, email attempted, SMS attempted, call attempted, and final "
    "delivery status."
))


# 19
story += section("19. Testing Strategy")

testing = [
    ["Test Level", "Scope"],
    ["Unit", "Routing, validation, permissions, priority and notification logic."],
    ["API", "Authentication, authorization, report lifecycle, SOS endpoints."],
    ["Integration", "Database, storage, routing and notification providers."],
    ["E2E", "Citizen report from creation through government resolution."],
    ["Mobile", "GPS, camera, background behavior, offline operation and SOS."],
    ["Security", "Authentication, authorization, file uploads, injection, abuse."],
    ["Performance", "Concurrent reports, uploads and notification queues."],
    ["Recovery", "Database restore, queue recovery and service failure."],
]

story.append(make_table(testing, widths=[35 * mm, 125 * mm]))

story.append(subsection("SOS Test Matrix"))

sos_tests = [
    ["Scenario", "Expected Result"],
    ["App foreground", "SOS trigger processed."],
    ["App background", "Supported behavior tested and documented."],
    ["Screen locked", "Supported behavior tested on target devices."],
    ["GPS available", "Current location included."],
    ["GPS unavailable", "SOS still recorded; location marked unavailable."],
    ["Internet unavailable", "Fallback behavior clearly handled."],
    ["SMS failure", "Email/call continue independently."],
    ["Email failure", "SMS/call continue independently."],
    ["Call failure", "Email/SMS results remain recorded."],
    ["Accidental trigger", "Cancellation window prevents accidental alert."],
    ["Repeated trigger", "Cooldown/rate limiting prevents notification abuse."],
]

story.append(make_table(sos_tests, widths=[55 * mm, 105 * mm]))


# 20
story += section("20. Development Roadmap")

roadmap = [
    ["Phase", "Deliverable"],
    ["01", "Requirements and stakeholder analysis"],
    ["02", "UI/UX design and prototype"],
    ["03", "Database schema and migrations"],
    ["04", "Backend foundation and authentication"],
    ["05", "Citizen web incident reporting"],
    ["06", "Maps, GPS and administrative boundaries"],
    ["07", "File upload and object storage"],
    ["08", "Authority routing engine"],
    ["09", "Email notification service"],
    ["10", "Government administration portal"],
    ["11", "Report tracking and status workflow"],
    ["12", "Mobile application"],
    ["13", "Emergency contact management"],
    ["14", "SMS integration"],
    ["15", "Calling integration"],
    ["16", "SOS backend and notification orchestration"],
    ["17", "Device-level SOS implementation/testing"],
    ["18", "Security hardening"],
    ["19", "Integration, performance and penetration testing"],
    ["20", "Deployment, pilot and production rollout"],
]

story.append(make_table(roadmap, widths=[20 * mm, 140 * mm]))


# 21
story += section("21. MVP Definition")

story.append(P(
    "The MVP should demonstrate a complete vertical slice rather than "
    "attempting every possible government feature."
))

mvp = [
    "Citizen incident submission.",
    "Anonymous and identified reporting.",
    "GPS/map location.",
    "Photo/file attachment.",
    "Reference number.",
    "Automatic authority routing.",
    "Authority email notification.",
    "Report tracking.",
    "Government dashboard.",
    "Report assignment and status.",
    "Emergency contact configuration.",
    "SOS backend.",
    "SOS email notification.",
    "SOS SMS notification.",
    "SOS phone-call initiation.",
    "Technical audit metadata including IP where legally permitted.",
]

for item in mvp:
    story.append(bullet(item))


# 22
story += section("22. Production Readiness Checklist")

checklist = [
    ["Area", "Requirement", "Complete"],
    ["Architecture", "All services documented", "☐"],
    ["Database", "Migrations and backups tested", "☐"],
    ["Security", "RBAC implemented and tested", "☐"],
    ["Security", "Administrator MFA enabled", "☐"],
    ["Security", "File upload security tested", "☐"],
    ["Privacy", "Privacy policy approved", "☐"],
    ["Privacy", "Retention policy approved", "☐"],
    ["Reports", "Full report lifecycle tested", "☐"],
    ["Maps", "GPS and manual location tested", "☐"],
    ["Routing", "Administrative routing verified", "☐"],
    ["Email", "Delivery and failure handling tested", "☐"],
    ["SMS", "Delivery and failure handling tested", "☐"],
    ["Calling", "Call initiation tested", "☐"],
    ["SOS", "Device-level trigger tested", "☐"],
    ["SOS", "Cancellation tested", "☐"],
    ["SOS", "Notification independence tested", "☐"],
    ["Performance", "Load testing completed", "☐"],
    ["Recovery", "Backup restore tested", "☐"],
    ["Monitoring", "Alerts configured", "☐"],
    ["Deployment", "Staging environment validated", "☐"],
    ["Operations", "Administrator manual completed", "☐"],
]

story.append(make_table(
    checklist,
    widths=[32 * mm, 105 * mm, 23 * mm],
    font_size=7.2
))


# FINAL
story.append(PageBreak())
story.append(P("Final Architecture Summary", "H1Custom"))

story.append(P(
    "CivicAlert should be implemented as a secure, modular government "
    "platform consisting of a citizen web portal, citizen mobile application, "
    "government administration portal and centralized backend services."
))

story.append(P(
    "Normal incident reports follow the path:"
))

story.append(code(
    "Citizen → Report → Location → Authority Routing → Email → Government Officer → Resolution"
))

story.append(P(
    "Emergency events follow the path:"
))

story.append(code(
    "Mobile SOS → Location → SOS Record → Notification Queue → Email + SMS + Call → Emergency Contact"
))

story.append(P(
    "The architecture deliberately separates device-level functionality "
    "from browser functionality, keeps sensitive credentials on the server, "
    "uses asynchronous notification processing, stores geographic information "
    "using PostGIS, and provides auditability and role-based access for the "
    "government environment."
))

story.append(Spacer(1, 15))
story.append(P(
    "<b>Recommended implementation principle:</b> build and validate the "
    "normal incident-reporting pipeline first, then implement the SOS "
    "notification backend, and finally integrate/test the device-level "
    "three-press trigger on the supported mobile platform.",
    "Callout"
))


# ============================================================
# BUILD PDF
# ============================================================

doc.build(
    story,
    onFirstPage=add_page_number,
    onLaterPages=add_page_number
)

print("=" * 70)
print("PDF GENERATED SUCCESSFULLY")
print("=" * 70)
print(f"File: {os.path.abspath(OUTPUT_FILE)}")
print("=" * 70)
