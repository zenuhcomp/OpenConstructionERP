"""Build the ``PartnerPackManifest`` instance for the aus-nzs pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="aus-nzs",
    partner_name="AU/NZ Construction Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pre-configured for Australian and New Zealand general contractors — "
        "AS 1684 timber framing, NZS 3604 timber-framed buildings, "
        "Rawlinsons Australian Construction Handbook cost DB, "
        "AS 4000 contract framework."
    ),
    default_locale="en-AU",
    additional_locales={},
    cwicr_regions=[
        "cwicr-eng-sydney",
    ],
    default_currency="AUD",
    default_tax_template="au_gst_10",
    validation_rule_packs=[
        "as_1684_timber",
        "nzs_3604_timber",
        "rawlinsons_benchmarks",
        "as_4000_contracts",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#012169",   # AU/NZ blue
        accent_color="#E4002B",    # AU/NZ red
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "AU+NZ",
        "country_name_en": "Australia and New Zealand",
        "regulator_refs": [
            "AS 1684 Residential timber-framed construction",
            "NZS 3604 Timber-framed buildings",
            "Rawlinsons Australian Construction Handbook",
            "AS 4000 General conditions of contract",
        ],
        "support_email": "info@datadrivenconstruction.io",
    },
)
