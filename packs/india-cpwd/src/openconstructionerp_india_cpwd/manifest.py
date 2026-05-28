"""Build the ``PartnerPackManifest`` instance for the india-cpwd pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="india-cpwd",
    partner_name="India Construction Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pre-configured for Indian general contractors and PSUs — "
        "CPWD (Central Public Works Department) specifications, "
        "IS codes (Indian Standard), DSR (Delhi Schedule of Rates), "
        "GST tax templates."
    ),
    default_locale="hi",
    additional_locales={
        "hi": "locales/hi.json",
    },
    cwicr_regions=[
        "cwicr-eng-mumbai",
    ],
    default_currency="INR",
    default_tax_template="in_gst_18",
    validation_rule_packs=[
        "cpwd_specs_2019",
        "is_456_concrete",
        "is_800_steel",
        "dsr_delhi_rates",
        "gst_compliance",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#FF9933",   # Saffron (Indian flag)
        accent_color="#138808",    # Green (Indian flag)
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "IN",
        "country_name_en": "India",
        "country_name_hi": "भारत",
        "regulator_refs": [
            "CPWD Specifications 2019",
            "IS 456:2000 (Concrete)",
            "IS 800:2007 (Steel)",
            "DSR (Delhi Schedule of Rates)",
            "CGST/SGST/IGST Act",
        ],
        "support_email": "info@datadrivenconstruction.io",
    },
)
