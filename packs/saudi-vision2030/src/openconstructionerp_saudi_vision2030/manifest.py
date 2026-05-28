"""Build the ``PartnerPackManifest`` instance for the saudi-vision2030 pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="saudi-vision2030",
    partner_name="Saudi Vision 2030 Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pre-configured for Saudi Arabian mega-projects — NEOM/Red Sea Global/RCJY "
        "standards, SBC (Saudi Building Code), MoMRAH urban planning, Aramco "
        "approval flows, dual-language Arabic + English."
    ),
    default_locale="ar",
    additional_locales={
        "ar": "locales/ar.json",
    },
    cwicr_regions=[
        "cwicr-eng-riyadh",
    ],
    default_currency="SAR",
    default_tax_template="sa_vat_15",
    validation_rule_packs=[
        "sbc_2018_structural",
        "sbc_2018_thermal",
        "momrah_urban_planning",
        "aramco_approval_chain",
        "neom_design_standards",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#006C35",   # Saudi flag green
        accent_color="#FFFFFF",    # white
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "SA",
        "country_name_en": "Kingdom of Saudi Arabia",
        "country_name_ar": "المملكة العربية السعودية",
        "regulator_refs": [
            "SBC 2018 (Saudi Building Code)",
            "MoMRAH (Ministry of Municipal, Rural Affairs and Housing)",
            "Saudi Aramco Engineering Standards",
            "NEOM Design Standards",
            "Royal Commission for Jubail and Yanbu (RCJY)",
        ],
        "writing_direction": "rtl",
        "support_email": "info@datadrivenconstruction.io",
    },
)
