"""‌⁠‍Property Development module permission definitions."""

from app.core.permissions import Role, permission_registry

PROPERTY_DEV_PERMISSIONS: dict[str, Role] = {
    "property_dev.read": Role.VIEWER,
    "property_dev.create": Role.EDITOR,
    "property_dev.update": Role.EDITOR,
    "property_dev.delete": Role.MANAGER,
    "property_dev.reserve_plot": Role.EDITOR,
    "property_dev.contract_buyer": Role.MANAGER,
    "property_dev.lock_selection": Role.MANAGER,
    "property_dev.handover": Role.MANAGER,
    "property_dev.fix_snag": Role.EDITOR,
    "property_dev.process_warranty": Role.EDITOR,
    # ── Task #138: Broker / Commission / Escrow / PriceMatrix / Reports ──
    # Brokers + agreements: EDITOR can CRUD master records but only
    # MANAGER+ can verify KYC (legal/compliance step).
    "property_dev.broker.kyc_verify": Role.MANAGER,
    # Commissions: accrual creation is event-driven and bypasses the
    # endpoint gates; the lifecycle (approve + pay) is MANAGER+.
    "property_dev.commission.approve": Role.MANAGER,
    "property_dev.commission.pay": Role.MANAGER,
    # Escrow: balance/list = VIEWER+; reconciliation = MANAGER+ because
    # it touches bank-side ledger evidence.
    "property_dev.escrow.reconcile": Role.MANAGER,
    # PriceMatrix lifecycle changes (activate + bulk-recompute) flip the
    # listed price of every plot; restricted to MANAGER+.
    "property_dev.price_matrix.activate": Role.MANAGER,
    "property_dev.price_matrix.bulk_recompute": Role.MANAGER,
    # Regulator reports get sent to RERA / MAHARERA / Rosfinmonitoring;
    # generation gate stays MANAGER+ to avoid accidental quarterly
    # disclosure from EDITOR-level sales staff.
    "property_dev.regulator_report.generate": Role.MANAGER,
}


def register_property_dev_permissions() -> None:
    """‌⁠‍Register permissions for the property_dev module."""
    permission_registry.register_module_permissions(
        "property_dev",
        PROPERTY_DEV_PERMISSIONS,
    )
