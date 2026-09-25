@echo off
REM ============================================================
REM  AVASYA MVP - LIVE VERIFICATION (run from the repo root)
REM  Usage:  scripts\run_mvp_checks.cmd
REM  Prereq: docker compose up -d  (db + backend + frontend healthy)
REM ============================================================
setlocal
set PYTHONIOENCODING=utf-8
set BASE=http://localhost:58000/api/v1
set FRONT=http://localhost:3001

echo ================================================================
echo  PART 0 - STACK HEALTH
echo ================================================================
docker compose ps --format "{{.Name}}  {{.Status}}"
curl -s %BASE%/../../health
echo.
curl -s %BASE%/../../health/db
echo.
curl -s -o nul -w "frontend :3001 -> HTTP %%{http_code}\n" %FRONT%/

echo.
echo ================================================================
echo  PART 1 - HAZARD DATA -^> HABITATION (RED/YELLOW/NO_ALERT/DATA_UNAVAILABLE)
echo ================================================================
echo  habitation 1 (Krishnapuram) statuses:
curl -s %BASE%/habitations/1/hazards | python -m json.tool
echo  overall:
curl -s %BASE%/habitations/1/hazards/overall | python -c "import json,sys;r=json.load(sys.stdin);print(r['hazard_type'],'->',r['status'],'| reasons:',r['reason_codes'])"
echo  missing-data rule (11 unit tests: no evidence / stale -^> DATA_UNAVAILABLE, never NO_ALERT):
python -m pytest tests\test_hazard_status.py -q --no-header

echo.
echo ================================================================
echo  PART 2 - RISK / URGENCY (weighted breakdown)
echo ================================================================
curl -s %BASE%/habitations/1/risk | python scripts\mvp_print.py risk

echo.
echo ================================================================
echo  PART 3 - HOW MANY PEOPLE NEED ACTION (relocation priority)
echo ================================================================
curl -s %BASE%/habitations/1/relocation | python -c "import json,sys;r=json.load(sys.stdin);print('PRIORITY:',r['priority_label'],'(score',str(r['priority_score'])+')');print(' reason:',r['rationale']['reason']);print(' required_capacity:',r['rationale']['required_capacity'])"

echo.
echo ================================================================
echo  PART 4 - USABLE CAPACITY GATE (insufficient is rejected)
echo ================================================================
for %%d in (1 2 3) do curl -s %BASE%/destinations/%%d/capacity | python -c "import json,sys;r=json.load(sys.stdin);v='ELIGIBLE' if r['eligibility'] else 'INSUFFICIENT (REJECTED)';print('  dest %%d: nominal',r['nominal_capacity'],'- occupancy',r['existing_occupancy'],'- constraints = usable',r['usable_capacity'],'| required',r['required_capacity'],'| gap',('+'+str(r['capacity_gap'])) if r['capacity_gap']>=0 else r['capacity_gap'],'->',v)"

echo.
echo ================================================================
echo  PART 5 - ROUTE / TRAVEL INFORMATION
echo ================================================================
curl -s %BASE%/habitations/1/transport | python -c "import json,sys;r=json.load(sys.stdin);rec=r['recommended_route'];print('  RECOMMENDED ->',rec['destination_name']);print('    distance',rec['distance_km'],'km | est time',rec['travel_time_hours'],'h | usable',rec['usable_capacity'],'>= required',rec['required_capacity'],':',rec['capacity_sufficient']);[print('  alternative ->',a['destination_name'],a['distance_km'],'km',a['travel_time_hours'],'h') for a in r['alternatives']];print('  methodology:',r['methodology']);[print('  limitation:',x[:90]) for x in r['limitations'][:3]]"

echo.
echo ================================================================
echo  PART 6 - EXPLAIN WHY (recommendation + response time + alert)
echo ================================================================
curl -s %BASE%/habitations/1/recommendation | python scripts\mvp_print.py recommendation
curl -s %BASE%/habitations/1/response-time | python -c "import json,sys;r=json.load(sys.stdin);print('  urgency:',r['urgency'],'| hazard',r['hazard_status'],'| transport',r['estimated_transport_time_hours'],'h + buffer',r['buffer_hours'],'h |',r['methodology'])"
curl -s %BASE%/habitations/1/alerts | python -c "import json,sys;r=json.load(sys.stdin);a=r['alerts'][0];print('  alert:',a['alert_kind'],'|',a['hazard'],a['severity'],'| action:',a['recommended_action'][:70]);print('  disclaimer:',r['disclaimer'])"

echo.
echo ================================================================
echo  PART 7 - RAG (semantic retrieval over the pgvector corpus)
echo ================================================================
curl -s -o rag_out.json -w "  index HTTP %%{http_code}\n" -X POST %BASE%/rag/index -H "Content-Type: application/json" -d "{}"
python -c "import json;r=json.load(open('rag_out.json'));d=r.get('detail',r);print('  chunks created/updated/skipped:',d.get('chunks_created'),d.get('chunks_updated'),d.get('chunks_skipped'),'| errors:',len(d.get('errors',[])))"
curl -s -o rag_out.json -w "  query HTTP %%{http_code}\n" -X POST %BASE%/rag/query -H "Content-Type: application/json" -d "{\"query\":\"flood evacuation guidelines\",\"filters\":{\"hazard_type\":\"flood\"},\"top_k\":3}"
python -c "import json;r=json.load(open('rag_out.json'));d=r.get('detail',r);print('  grounding:',d.get('grounding_status'),'| results:',len(d.get('results',[])));[print('   -',c.get('score'),(c.get('title') or '')[:60]) for c in d.get('results',[])[:3]]"
curl -s -o rag_out.json -w "  answer HTTP %%{http_code}\n" -X POST %BASE%/rag/answer -H "Content-Type: application/json" -d "{\"question\":\"flood evacuation guidelines\",\"top_k\":2}"
python -c "import json;r=json.load(open('rag_out.json'));d=r.get('detail',r);print('  mode:',d.get('mode'),'| grounding:',d.get('grounding_status'));print('  answer:',(d.get('answer') or '')[:140]);print('  citations:',[c.get('source_id') for c in d.get('chunks_used',[])])"
del rag_out.json >nul 2>&1

echo.
echo ================================================================
echo  PART 8 - LLM EXPLANATION (honest status until teammate module is wired)
echo ================================================================
curl -s -o llm_out.json -w "  HTTP %%{http_code}\n" -X POST %BASE%/llm/explain -H "Content-Type: application/json" -d "{\"question\":\"Why relocate?\",\"avasya_context\":{\"population\":1240}}"
python -c "import json;r=json.load(open('llm_out.json'));d=r.get('detail',r);print('  integration_pending:',d.get('integration_pending'))"
del llm_out.json >nul 2>&1

echo.
echo ================================================================
echo  PART 9 - CLAIM VALIDATION (VERIFIED / CONFLICT / UNSUPPORTED)
echo ================================================================
curl -s -X POST %BASE%/habitations/1/claims/validate -H "Content-Type: application/json" -d "{\"question\":\"t\",\"avasya_context\":{},\"claims\":[{\"field\":\"population\",\"value\":1240},{\"field\":\"population\",\"value\":1500},{\"field\":\"travel_time_hours\",\"value\":0.5}]}" | python scripts\mvp_print.py claims

echo.
echo ================================================================
echo  PART 10 - OFFICER APPROVAL / OVERRIDE + AUDIT TRAIL
echo ================================================================
curl -s -o nul -w "  10a unauthenticated approval -> HTTP %%{http_code} (must be 401)\n" -X POST %BASE%/recommendations/18/approval -H "Content-Type: application/json" -d "{\"action\":\"APPROVE\"}"
curl -s -X POST %BASE%/recommendations/18/approval -H "Content-Type: application/json" -H "X-Officer-Email: demo.officer@avasya.local" -d "{\"action\":\"APPROVE\"}" | python -c "import json,sys;r=json.load(sys.stdin);print('  10b APPROVE ->',r.get('action'),'| rec',r.get('recommendation_id'))"
curl -s -o nul -w "  10c OVERRIDE to INSUFFICIENT dest 2 -> HTTP %%{http_code} (must be 422)\n" -X POST %BASE%/recommendations/18/approval -H "Content-Type: application/json" -H "X-Officer-Email: demo.officer@avasya.local" -d "{\"action\":\"OVERRIDE\",\"override_note\":\"try insufficient shelter\",\"final_destination_id\":2}"
curl -s -X POST %BASE%/recommendations/18/approval -H "Content-Type: application/json" -H "X-Officer-Email: demo.officer@avasya.local" -d "{\"action\":\"OVERRIDE\",\"override_note\":\"Confirmed with field team\",\"final_destination_id\":1}" | python -c "import json,sys;r=json.load(sys.stdin);print('  10d OVERRIDE ->',r.get('action'),'| final dest',r.get('final_destination_id'))"
echo  10e audit rows in PostgreSQL:
docker compose exec -T db psql -U avasya -d avasya -c "SELECT id, recommendation_id, action, officer_user_id, final_destination_id, original_recommendation IS NOT NULL AS snapshot FROM recommendation_approvals ORDER BY id DESC LIMIT 4;"

echo.
echo ================================================================
echo  PART 11 - HAZARD MAP (GIS zones + traffic risk, live)
echo ================================================================
curl -s %BASE%/gis/hazard-zones | python scripts\mvp_print.py zones

echo.
echo ================================================================
echo  PART 12 - FRONTEND PAGES
echo ================================================================
curl -s -o nul -w "  /hazard-map            -> HTTP %%{http_code}\n" %FRONT%/hazard-map
curl -s -o nul -w "  /habitations/1         -> HTTP %%{http_code}\n" %FRONT%/habitations/1
curl -s -o nul -w "  /recommendations/REC-1 -> HTTP %%{http_code}\n" %FRONT%/recommendations/REC-1

echo.
echo ================================================================
echo  PART 13 - FULL TEST SUITE + TYPECHECK
echo ================================================================
python -m pytest tests\ backend\tests -q --no-header
pushd frontend
npx tsc --noEmit
if errorlevel 1 (echo  tsc: ERRORS) else (echo  tsc: clean)
popd

echo.
echo ================================================================
echo  DONE - all parts executed against the live stack.
echo ================================================================
endlocal
