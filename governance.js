/**
 * SPRINT 0: DATA GOVERNANCE & PROMO STANDARDS
 * This file defines the standard business rules, promo hierarchies, and status definitions.
 */

export const PROMO_HIERARCHY = {
    "Scan Downs": ["Monthly Scan Down", "New Item Scan Down", "Holiday Scan Down"],
    "TPRs": ["Temporary Price Reduction", "Manager Special"],
    "BOGOs": ["BOGO 50%", "BOGO Free"],
    "Display Credits": ["Endcap Placement", "Shipper Credit", "In-Store Demo"],
    "Marketing Funds": ["Newsletter Feature", "Social Media Spotlight", "Digital Coupon"],
    "Price Protection": ["Cost Decrease Protection", "Inventory Revaluation"]
};

export const STATUS_DEFINITIONS = [
    { id: "DISCOVERED", displayName: "Discovered", order: 1, color: "#94a3b8" }, // Gray
    { id: "VALIDATED", displayName: "Validated", order: 2, color: "#60a5fa" }, // Blue
    { id: "READY_TO_SEND", displayName: "Ready To Send", order: 3, color: "#818cf8" }, // Indigo
    { id: "CONTACTED", displayName: "Contacted", order: 4, color: "#fbbf24" }, // Amber
    { id: "AWAITING_RESPONSE", displayName: "Awaiting Response", order: 5, color: "#f59e0b" }, // Orange
    { id: "UNDER_REVIEW", displayName: "Under Review", order: 6, color: "#fb923c" }, // Deep Orange
    { id: "CREDIT_APPROVED", displayName: "Credit Approved", order: 7, color: "#34d399" }, // Emerald
    { id: "MEMO_RECEIVED", displayName: "Memo Received", order: 8, color: "#10b981" }, // Green
    { id: "APPLIED", displayName: "Applied", order: 9, color: "#059669" }, // Dark Green
    { id: "REJECTED", displayName: "Rejected", order: 10, color: "#f87171" }, // Red
    { id: "WRITTEN_OFF", displayName: "Written Off", order: 11, color: "#475569" } // Slate
];

export const CREDIT_TYPES = [
    "Scan Down",
    "TPR",
    "BOGO",
    "Display Credit",
    "Marketing Fund",
    "New Item Credit",
    "Price Protection",
    "Other"
];

export const NAMING_CONVENTIONS = {
    REPORT_FILE: "YYYY-MM_{BrandName}_{StoreName}_Report",
    DOCUMENT_FILE: "REQ_{RequestID}_{Type}_{BrandName}"
};

export const AUDIT_ACTIONS = {
    VENDOR_MAPPED: "Vendor Mapped",
    BRAND_LINKED: "Brand Linked",
    MAPPING_QUEUE_UPDATED: "Mapping Queue Updated",
    STATUS_CHANGE: "Status Changed",
    DOCUMENT_UPLOAD: "Document Uploaded",
    REPORT_PUBLISHED: "Report Published",
    LOGIN_SUCCESS: "Login Successful",
    LOGIN_FAILURE: "Login Failed",
    CREDIT_UPDATED: "Credit Amount Updated",
    COMMUNICATION_LOGGED: "Communication Logged",
    FORENSIC_SCAN_COMPLETED: "Forensic Scan Completed",
    FORENSIC_VIOLATION_FLAGGED: "Forensic Violation Flagged",
    FORENSIC_FINDING_RESOLVED: "Forensic Finding Resolved"
};

/**
 * LIGHTHOUSE FORENSIC ACCOUNTING & SOFT AUDIT GOVERNANCE
 * Defines violation categories, severity levels, audit lifecycle statuses, and default thresholds.
 */

export const AUDIT_VIOLATION_TYPES = {
    VARIANCE_ANOMALY: "Variance Anomaly",
    DUPLICATE_CLAIM: "Potential Duplicate Claim",
    MAPPING_AMBIGUITY: "Mapping Ambiguity",
    STALE_CREDIT: "Stale/Aging Credit",
    UNMAPPED_GL_RECOVERY: "Unmapped GL Recovery",
    ORPHANED_SETTLEMENT: "Orphaned GL Settlement"
};

export const AUDIT_SEVERITY = {
    CRITICAL: "Critical",
    WARNING: "Warning",
    INFO: "Info"
};

export const FORENSIC_AUDIT_STATUS = {
    PENDING_REVIEW: "Pending Review",
    AUDIT_FLAGGED: "Audit Flagged",
    CLEARED: "Cleared",
    REMEDIATED: "Remediated",
    ESCALATED: "Escalated"
};

export const FORENSIC_THRESHOLDS = {
    VARIANCE_TOLERANCE_DOLLARS: 25.00,
    VARIANCE_TOLERANCE_PERCENT: 0.05, // 5% variance threshold
    CRITICAL_VARIANCE_DOLLARS: 500.00,
    CRITICAL_VARIANCE_PERCENT: 0.20,  // 20% critical threshold
    STALE_DISCOVERY_SLA_DAYS: 30,     // Max days in DISCOVERED / VALIDATED before outreach
    AGING_CRITICAL_SLA_DAYS: 90       // Max days unrecovered before critical aging flag
};

