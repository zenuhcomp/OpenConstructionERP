"""Build the ``PartnerPackManifest`` instance for the modular-prefab pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="modular-prefab",
    partner_name="Modular & Prefab Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pre-configured for modular construction and PMC contractors — "
        "factory-line scheduling, container takeoff, transport logistics, "
        "EN 1090 steel + AS 5104 modular building standards."
    ),
    default_locale="en",
    additional_locales={},
    cwicr_regions=[
        "cwicr-eng-london",
    ],
    default_currency="EUR",
    default_tax_template=None,
    validation_rule_packs=[
        "en_1090_steel",
        "as_5104_modular",
        "factory_qc_schedule",
        "transport_logistics",
        "module_handover_protocol",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#1F4E79",   # industrial blue
        accent_color="#FFB81C",    # modular yellow
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "XX",
        "country_name_en": "Cross-region (Modular & Prefab)",
        "regulator_refs": ["EN 1090", "AS 5104", "ISO 3834", "EN 1993-1-1"],
        "support_email": "info@datadrivenconstruction.io",
    },
)
