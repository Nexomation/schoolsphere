import "server-only";
import { pgArray, withService } from "./db";
import { evaluateTripAlerts } from "./data/transport";
import { guardianUserIds, notifyUsers } from "./data/notifications";
import { logger } from "./logger";

/**
 * Runs after each accepted fix: evaluates delay/deviation, then notifies
 * transport staff (and, for delays, the families waiting at later stops).
 * Failures are logged and never reject the telemetry itself.
 */
export async function processTripAlerts(tripId: string) {
  try {
    const raised = await withService((sql) => evaluateTripAlerts(sql, tripId));
    for (const a of raised) {
      const recipients = await withService(async (sql) => {
        const staff = await sql.many<{ user_id: string }>(
          "select user_id from school_memberships where school_id = $1 and role in ('school_admin', 'transport_coordinator') and status = 'active'",
          [a.schoolId],
        );
        let families: string[] = [];
        if (a.type === "delay" && a.stopIds.length) {
          const students = await sql.many<{ student_id: string }>(
            "select student_id from student_transport_assignments where route_id = $1 and stop_id = any($2::uuid[]) and end_date is null",
            [a.routeId, pgArray(a.stopIds)],
          );
          families = [...(await guardianUserIds(sql, students.map((s) => s.student_id))).values()].flat();
        }
        return { staff: staff.map((s) => s.user_id), families };
      });
      await notifyUsers({ schoolId: a.schoolId, userIds: recipients.staff, type: "transport", title: a.type === "delay" ? "Transport delay" : "Route deviation", body: a.message, link: `/app/transport/trips/${tripId}` });
      if (recipients.families.length) {
        await notifyUsers({ schoolId: a.schoolId, userIds: recipients.families, type: "transport", title: "School van running late", body: a.message, link: "/app/transport" });
      }
    }
  } catch (error) {
    logger.error("Trip alert evaluation failed", { tripId, error });
  }
}
