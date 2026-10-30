from enum import Enum
from typing import List
from pydantic import BaseModel, Field


class TicketPriority(str, Enum):
    P0 = "P0"  # Complete service outage, data breach, legal threat
    P1 = "P1"  # Major functionality impaired, billing dispute > $500
    P2 = "P2"  # Minor functionality bug, standard billing query
    P3 = "P3"  # General inquiry, feature request, cosmetic feedback


class TicketCategory(str, Enum):
    BILLING = "billing"
    TECHNICAL_SUPPORT = "technical_support"
    ACCOUNT_SECURITY = "account_security"
    FEATURE_REQUEST = "feature_request"
    GENERAL_INQUIRY = "general_inquiry"


class CustomerSentiment(str, Enum):
    FRUSTRATED = "frustrated"
    NEUTRAL = "neutral"
    SATISFIED = "satisfied"


class TriageResult(BaseModel):
    category: TicketCategory = Field(..., description="High-level classification")
    priority: TicketPriority = Field(..., description="SLA urgency tier")
    sentiment: CustomerSentiment = Field(..., description="Detected customer emotion")
    routing_team: str = Field(..., min_length=2, description="Target internal engineering or support team")
    extracted_claims: List[str] = Field(default_factory=list, description="Key statements/facts from customer message")
    requires_human_escalation: bool = Field(..., description="True if legal, security breach, severe outage, or policy exception")
    draft_response: str = Field(..., min_length=10, max_length=1500, description="Customer-facing response grounded in policy")


class TicketInput(BaseModel):
    ticket_id: str
    customer_id: str
    subject: str
    message: str
    tier: str = Field(default="standard", description="standard, pro, or enterprise")
