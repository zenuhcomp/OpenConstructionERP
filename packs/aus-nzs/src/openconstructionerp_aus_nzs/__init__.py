"""OpenConstructionERP — AU/NZ Construction partner pack (AS 1684 + NZS 3604 + Rawlinsons + AS 4000).

This package exports a module-level ``MANIFEST`` instance of
:class:`PartnerPackManifest` referenced from ``pyproject.toml``::

    [project.entry-points."openconstructionerp.partner_packs"]
    aus-nzs = "openconstructionerp_aus_nzs:MANIFEST"

The OCERP core discovers this entry point at boot, validates the
manifest, and applies the partner overrides (branding, locale,
cost regions, validation rule packs, onboarding script).
"""

from __future__ import annotations

from .manifest import MANIFEST

__all__ = ["MANIFEST"]
__version__ = "0.1.0"
