import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handleAlerts({ payload, eventName, insertPayload }: WebhookHandlerContext) {
  switch (eventName) {
    case 'security_advisory':
      await insertPayload(eventTables.securityAdvisory, {
        ghsa_id: payload.security_advisory?.ghsa_id,
        summary: payload.security_advisory?.summary,
        severity: payload.security_advisory?.severity,
        published_at: payload.security_advisory?.published_at,
        updated_at: payload.security_advisory?.updated_at,
        withdrawn_at: payload.security_advisory?.withdrawn_at,
      });
      break;
    case 'code_scanning_alert':
      await insertPayload(eventTables.codeScanningAlert, {
        alert_number: payload.alert?.number,
        alert_url: payload.alert?.url,
        state: payload.alert?.state,
        resolution: payload.alert?.dismissed_reason || null,
        severity: payload.alert?.rule?.severity,
        rule_id: payload.alert?.rule?.id,
        tool_name: payload.alert?.tool?.name,
        created_at: payload.alert?.created_at,
      });
      break;
    case 'dependabot_alert':
      await insertPayload(eventTables.dependabotAlert, {
        alert_number: payload.alert?.number,
        state: payload.alert?.state,
        dependency_package: payload.alert?.dependency?.package?.name,
        security_advisory_id: payload.alert?.security_advisory?.ghsa_id,
        severity: payload.alert?.security_advisory?.severity,
        dismissed_reason: payload.alert?.dismissed_reason,
        dismissed_at: payload.alert?.dismissed_at,
      });
      break;
    case 'secret_scanning_alert':
      await insertPayload(eventTables.secretScanningAlert, {
        alert_number: payload.alert?.number,
        secret_type: payload.alert?.secret_type,
        resolution: payload.alert?.resolution,
        state: payload.alert?.state,
        created_at: payload.alert?.created_at,
        resolved_at: payload.alert?.resolved_at,
      });
      break;
  }
}
