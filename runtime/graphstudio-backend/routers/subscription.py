from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import models
import schemas
import database
from routers.auth import get_current_user
import sys
import time
from pathlib import Path

# Add trilog imports - using centralized schemas
nexus_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(nexus_root))
from trilog_schemas import User, Subscription as SubscriptionSchema, SubscriptionManagement
from trilog.context import anchor
from trilog_setup import get_logger

logger = get_logger("graphstudio.subscription")

router = APIRouter(
    prefix="/subscription",
    tags=["subscription"]
)

@router.get("/", response_model=schemas.Subscription)
def get_subscription(current_user: models.User = Depends(get_current_user)):
    if not current_user.subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return current_user.subscription

@router.post("/upgrade")
def upgrade_subscription(plan: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    # In a real app, this would integrate with Stripe/LemonSqueezy
    if plan not in ["pro", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid plan")

    sub = current_user.subscription
    old_plan = sub.plan_name

    change_id = f"subchange_{int(time.time() * 1000000)}"

    with anchor(change_id, SubscriptionManagement):
        logger.event("subscription_upgrade_requested",
            user_id=current_user.id,
            previous_tier=old_plan,
            new_tier=plan
        )

        sub.plan_name = plan
        db.commit()

        logger.state_change(
            status="completed",
            previous_tier=old_plan,
            new_tier=plan
        )

    # Update user's cached tier
    with anchor(current_user.id, User):
        logger.state_change(subscription_tier=plan)

    return {"message": f"Upgraded to {plan}"}
