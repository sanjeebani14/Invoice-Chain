from fastapi import APIRouter

# Import individual functional routers
from app.api.risk import router as risk_router
from app.api.analytics import router as analytics_router
from app.api.sme_dashboard import router as sme_dashboard_router
from app.routers.invoice import router as invoice_router
from app.routers.auth import router as auth_router
from app.routers.kyc import router as kyc_router, admin_router as admin_kyc_router
from app.routers.profile import router as profile_router
from app.routers.admin_users import router as admin_users_router
from app.routers.admin_stats import router as admin_stats_router
from app.routers.wallet import router as wallet_router

# Initialize the master aggregator
api_router = APIRouter()

# User and profile management
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(wallet_router, prefix="/wallet", tags=["Wallet"])
api_router.include_router(kyc_router, prefix="/kyc", tags=["KYC"])
api_router.include_router(profile_router, prefix="/profile", tags=["Profile"])

# Admin management
api_router.include_router(admin_users_router, prefix="/admin/users", tags=["Admin Users"])
api_router.include_router(admin_stats_router, prefix="/admin/stats", tags=["Admin Stats"])
api_router.include_router(admin_kyc_router, prefix="/admin/kyc", tags=["Admin KYC"])

# Invoice processing, risk, and analytics
api_router.include_router(invoice_router, prefix="/invoice", tags=["Invoice Processing"])
api_router.include_router(risk_router, prefix="/risk", tags=["Risk & Fraud"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(sme_dashboard_router)
