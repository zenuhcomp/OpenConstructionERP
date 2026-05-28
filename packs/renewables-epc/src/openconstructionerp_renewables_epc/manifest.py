"""Build the ``PartnerPackManifest`` instance for the renewables-epc pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="renewables-epc",
    partner_name="Renewables EPC Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pre-configured for solar/wind EPC contractors — PV array takeoff, "
        "turbine BOM, MV cable schedules, LCOE templates, IEC 61400 (wind) + "
        "IEC 61730 (PV) compliance, cross-region."
    ),
    default_locale="en",
    additional_locales={},
    cwicr_regions=[
        "cwicr-eng-london",
    ],
    default_currency="EUR",
    default_tax_template=None,
    validation_rule_packs=[
        "iec_61400_wind",
        "iec_61730_pv",
        "lcoe_templates",
        "mv_cable_specs",
        "renewables_grid_compliance",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#00A859",   # renewable green
        accent_color="#0072CE",    # energy blue
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "XX",
        "country_name_en": "Cross-region (Renewables EPC)",
        "regulator_refs": ["IEC 61400", "IEC 61730", "IEC 62548", "IEEE 1547", "IEC 60364-7-712"],
        "support_email": "info@datadrivenconstruction.io",
    },
)
