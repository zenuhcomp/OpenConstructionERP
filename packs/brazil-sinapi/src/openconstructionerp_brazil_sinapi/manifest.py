"""Build the ``PartnerPackManifest`` instance for the brazil-sinapi pack.

Kept in its own module so unit tests can import the manifest without
triggering the package ``__init__`` side-effects.
"""

from __future__ import annotations

from app.core.partner_pack.manifest import PartnerBranding, PartnerPackManifest

MANIFEST = PartnerPackManifest(
    slug="brazil-sinapi",
    partner_name="Brazil Construction Pack",
    partner_url=None,
    pack_version="0.1.0",
    description=(
        "Pré-configurado para construtoras brasileiras — SINAPI banco de dados "
        "de custos, NBR 12721 ABNT, geração de RPS PDF, impostos ISS estaduais."
    ),
    default_locale="pt",
    additional_locales={
        "pt": "locales/pt-BR.json",
    },
    cwicr_regions=[
        "cwicr-por-saopaulo",
    ],
    default_currency="BRL",
    default_tax_template="br_iss_state",
    validation_rule_packs=[
        "sinapi_cost_db",
        "nbr_12721",
        "abnt_concrete",
        "rps_pdf_generation",
    ],
    default_modules=[],   # empty = show all
    hidden_modules=[],
    branding=PartnerBranding(
        primary_color="#009C3B",   # Brazil green
        accent_color="#FFDF00",    # Brazil yellow
        logo_path="logo.svg",
        favicon_path=None,
        powered_by_text=None,      # use default co-branding string
    ),
    onboarding_script_path="onboarding.yaml",
    metadata={
        "country": "BR",
        "country_name_en": "Brazil",
        "country_name_pt": "Brasil",
        "regulator_refs": ["SINAPI", "NBR 12721", "ABNT", "RPS", "ISS"],
        "support_email": "info@datadrivenconstruction.io",
    },
)
