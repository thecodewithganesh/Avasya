from __future__ import annotations


def test_hazards_endpoint_contract(client, habitation, demo_world):
    response = client.get(f"/api/v1/habitations/{habitation.id}/hazards")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list) and len(body) == 1
    hazard = body[0]
    for key in (
        "status", "hazard_type", "severity_score", "basis", "methodology",
        "reason_codes", "limitations", "data_origin", "staleness_limit_hours",
    ):
        assert key in hazard
    assert hazard["status"] == "RED"
    assert hazard["basis"] == "OPERATIONAL_THRESHOLD"
    assert "AVASYA" in hazard["methodology"]


def test_overall_hazard_endpoint(client, habitation, demo_world):
    response = client.get(f"/api/v1/habitations/{habitation.id}/hazards/overall")
    assert response.status_code == 200
    assert response.json()["status"] == "RED"


def test_no_linked_hazard_is_data_unavailable_not_no_alert(client, habitation):
    response = client.get(f"/api/v1/habitations/{habitation.id}/hazards")
    assert response.status_code == 200
    body = response.json()
    assert body[0]["status"] == "DATA_UNAVAILABLE"
    assert "NO_LINKED_HAZARD_EVIDENCE" in body[0]["reason_codes"]


def test_response_time_endpoint(client, habitation, demo_world):
    response = client.get(f"/api/v1/habitations/{habitation.id}/response-time")
    assert response.status_code == 200
    body = response.json()
    assert body["urgency"] == "IMMEDIATE"
    assert "AVASYA" in body["methodology"]
    assert any("not an official" in lim for lim in body["limitations"])


def test_transport_endpoint_excludes_insufficient(client, habitation, demo_world):
    response = client.get(f"/api/v1/habitations/{habitation.id}/transport")
    assert response.status_code == 200
    body = response.json()
    ids = ([body["recommended_destination_id"]] if body["recommended_destination_id"] else []) + [
        option["destination_id"] for option in body["alternatives"]
    ]
    assert demo_world["insufficient"].id not in ids
    assert demo_world["eligible"].id in ids
    assert any("great-circle" in lim for lim in body["limitations"])


def test_alerts_endpoint_labels_decision_support(client, habitation, demo_world):
    response = client.get(f"/api/v1/habitations/{habitation.id}/alerts")
    assert response.status_code == 200
    body = response.json()
    assert body["disclaimer"].startswith("AVASYA decision-support alerts are NOT official")
    alert = body["alerts"][0]
    assert alert["alert_kind"] == "AVASYA_DECISION_SUPPORT_ALERT"
    assert any("NOT an official government warning" in lim for lim in alert["limitations"])


def test_assess_endpoint_full_chain(client, habitation, demo_world):
    response = client.post(f"/api/v1/habitations/{habitation.id}/assess")
    assert response.status_code == 200
    body = response.json()
    assert body["overall_hazard_status"] == "RED"
    assert body["risk"]["level"] in {"LOW", "MEDIUM", "HIGH"}
    assert body["response_time"]["urgency"] == "IMMEDIATE"
    assert body["alert"]["alert_kind"] == "AVASYA_DECISION_SUPPORT_ALERT"
    assert len(body["chain"]) >= 6


def test_assess_unknown_habitation_404(client):
    response = client.post("/api/v1/habitations/999999/assess")
    assert response.status_code == 404


def test_rag_query_integration_pending(client):
    response = client.post(
        "/api/v1/rag/query",
        json={"query": "flood warning guidelines", "top_k": 3},
    )
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["integration_pending"] is True
    assert detail["grounding_status"] == "UNSUPPORTED"


def test_llm_explain_integration_pending(client):
    response = client.post(
        "/api/v1/llm/explain",
        json={"question": "why this destination?", "avasya_context": {}},
    )
    assert response.status_code == 503
    assert response.json()["detail"]["integration_pending"] is True


def test_claim_validation_endpoint(client, habitation):
    response = client.post(
        f"/api/v1/habitations/{habitation.id}/claims/validate",
        json={
            "question": "population check",
            "avasya_context": {},
            "claims": [
                {"field": "population", "value": 1200},
                {"field": "population", "value": 9999},
                {"field": "made_up_metric", "value": 1},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    statuses = [claim["status"] for claim in body["claims"]]
    assert statuses == ["VERIFIED", "CONFLICT", "UNSUPPORTED"]
    assert body["summary"] == {"VERIFIED": 1, "CONFLICT": 1, "UNSUPPORTED": 1}


def test_knowledge_sources_endpoint(client, db_session, habitation):
    from backend.models import Evidence
    from backend.models.enums import DataOrigin

    db_session.add(Evidence(
        source_name="India Flood Inventory (demo fixture)",
        source_type="geojson",
        evidence_type="flood",
        evidence_payload={"dataset": "flood", "version_or_date": "2026-01-01"},
        external_reference="demo-hash-1",
        data_origin=DataOrigin.REAL,
    ))
    db_session.commit()

    response = client.get("/api/v1/knowledge-sources")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert any(source["source_name"].startswith("India Flood Inventory") for source in body["sources"])
    assert "by_data_origin" in body
