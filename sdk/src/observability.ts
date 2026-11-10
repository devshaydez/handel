/**
 * Bounded, privacy-conscious operational telemetry for Handel hosts.
 * Feed normalized journal/contract observations; never pass wallet signatures,
 * private keys, access tokens, full RPC payloads, or user profile data.
 */
export type MonitorSeverity = "info" | "warning" | "critical";
export type MonitorStatus = "prepared" | "submitting" | "submitted" | "succeeded" |
  "failed_definitive" | "outcome_unknown" | "PaymentPayoutPending" |
  "CollateralPayoutPending" | "ExpiryPayoutPending" | "ReconciliationRequired";

export interface MonitorOperation {
  id: string;
  status: MonitorStatus;
  updatedAt: number;
}
export interface MonitorPosition {
  id: string;
  state: string;
  updatedAt: number;
}
export interface MonitorEvent {
  id: string;
  at: number;
  severity: MonitorSeverity;
  code: string;
  subjectId: string;
  message: string;
}
export interface MonitorPolicy {
  warningAfterMs: number;
  criticalAfterMs: number;
  maxEvents: number;
}
export interface MonitorSnapshot {
  generatedAt: number;
  operationCounts: Record<string, number>;
  positionStateCounts: Record<string, number>;
  alerts: MonitorEvent[];
  events: MonitorEvent[];
}
const DEFAULT_POLICY: MonitorPolicy = {
  warningAfterMs: 5 * 60_000,
  criticalAfterMs: 30 * 60_000,
  maxEvents: 500,
};
const STUCK = new Set(["submitting", "submitted", "outcome_unknown",
  "PaymentPayoutPending", "CollateralPayoutPending", "ExpiryPayoutPending",
  "ReconciliationRequired"]);
function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96) || "unknown";
}
export class HandelMonitor {
  private events: MonitorEvent[] = [];
  private sequence = 0;
  constructor(private readonly policy: MonitorPolicy = DEFAULT_POLICY) {
    if (!Number.isFinite(policy.warningAfterMs) || policy.warningAfterMs < 0 ||
        !Number.isFinite(policy.criticalAfterMs) || policy.criticalAfterMs < policy.warningAfterMs ||
        !Number.isInteger(policy.maxEvents) || policy.maxEvents < 1 || policy.maxEvents > 10_000) {
      throw new Error("Invalid monitoring policy");
    }
  }
  observe(operations: MonitorOperation[], positions: MonitorPosition[], now = Date.now()): MonitorSnapshot {
    if (!Number.isFinite(now)) throw new Error("Invalid monitor timestamp");
    const operationCounts: Record<string, number> = {};
    const positionStateCounts: Record<string, number> = {};
    const alerts: MonitorEvent[] = [];
    for (const operation of operations) {
      operationCounts[operation.status] = (operationCounts[operation.status] ?? 0) + 1;
      this.checkStuck(operation.id, operation.status, operation.updatedAt, now, alerts);
    }
    for (const position of positions) {
      positionStateCounts[position.state] = (positionStateCounts[position.state] ?? 0) + 1;
      this.checkStuck(position.id, position.state, position.updatedAt, now, alerts);
    }
    for (const alert of alerts) this.append(alert);
    return { generatedAt: now, operationCounts, positionStateCounts,
      alerts, events: this.events.map((event) => ({ ...event })) };
  }
  private checkStuck(id: string, status: string, updatedAt: number, now: number, alerts: MonitorEvent[]): void {
    if (!STUCK.has(status)) return;
    if (!Number.isFinite(updatedAt) || updatedAt > now) {
      alerts.push(this.event("warning", "invalid_observation_time", id,
        "Observation timestamp is invalid; investigate the source clock.", now));
      return;
    }
    const age = now - updatedAt;
    if (age < this.policy.warningAfterMs) return;
    const severity: MonitorSeverity = age >= this.policy.criticalAfterMs ? "critical" : "warning";
    alerts.push(this.event(severity, "stuck_operation", id,
      `Status ${status} has remained unchanged for ${Math.floor(age / 1000)} seconds.`, now));
  }
  private event(severity: MonitorSeverity, code: string, subjectId: string, message: string, at: number): MonitorEvent {
    return { id: String(++this.sequence), at, severity, code,
      subjectId: safeId(subjectId), message: message.slice(0, 240) };
  }
  private append(event: MonitorEvent): void {
    this.events.push(event);
    if (this.events.length > this.policy.maxEvents) this.events.splice(0, this.events.length - this.policy.maxEvents);
  }
  listEvents(): MonitorEvent[] { return this.events.map((event) => ({ ...event })); }
}
