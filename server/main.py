from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import date
from dotenv import load_dotenv
import os
import httpx

load_dotenv()

app = FastAPI(title="Returns Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TABLE = "portfolio_snapshots"


def headers():
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def base_url():
    return os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/{TABLE}"


# ─── Models ───────────────────────────────────────────────────────────────────

class SnapshotIn(BaseModel):
    date: date
    account: str = "Fidelity"
    value: float
    cost_basis: float


class SnapshotUpdate(BaseModel):
    value: float | None = None
    cost_basis: float | None = None


class AddCostBasis(BaseModel):
    date: date
    account: str
    amount: float


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/snapshots")
def list_snapshots():
    r = httpx.get(base_url(), headers=headers(), params={"order": "date.asc"})
    r.raise_for_status()
    return r.json()


@app.post("/api/snapshots", status_code=201)
def create_snapshot(s: SnapshotIn):
    payload = {"date": str(s.date), "account": s.account, "value": s.value, "cost_basis": s.cost_basis}
    r = httpx.post(
        base_url(),
        headers={**headers(), "Prefer": "return=representation,resolution=merge-duplicates"},
        json=payload,
    )
    r.raise_for_status()
    return r.json()[0]


@app.put("/api/snapshots/{snapshot_id}")
def update_snapshot(snapshot_id: str, s: SnapshotUpdate):
    updates = {k: v for k, v in s.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    r = httpx.patch(
        base_url(),
        headers=headers(),
        params={"id": f"eq.{snapshot_id}"},
        json=updates,
    )
    r.raise_for_status()
    data = r.json()
    if not data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return data[0]


@app.delete("/api/snapshots/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: str):
    r = httpx.delete(base_url(), headers=headers(), params={"id": f"eq.{snapshot_id}"})
    r.raise_for_status()


@app.post("/api/snapshots/add-cost-basis", status_code=201)
def add_cost_basis(body: AddCostBasis):
    # Get latest snapshot for this account
    r = httpx.get(
        base_url(),
        headers=headers(),
        params={"account": f"eq.{body.account}", "order": "date.desc", "limit": "1"},
    )
    r.raise_for_status()
    data = r.json()
    last = data[0] if data else {"value": 0.0, "cost_basis": 0.0}

    payload = {
        "date": str(body.date),
        "account": body.account,
        "value": last["value"],
        "cost_basis": last["cost_basis"] + body.amount,
    }
    r2 = httpx.post(
        base_url(),
        headers={**headers(), "Prefer": "return=representation,resolution=merge-duplicates"},
        json=payload,
    )
    r2.raise_for_status()
    return r2.json()[0]
