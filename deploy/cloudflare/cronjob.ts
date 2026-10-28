import { handler } from "../../cronjob/handler";
import { JobEntity } from "../../src/serve-utils/domain/Job";
import { logTiming, timeUpstreamFetch } from "../shared/trace-fetch";

interface IScheduledController {
  cron: string;
}

// spec-6 A3
const schedules: Record<string, JobEntity> = {
  "*/5 * * * *": JobEntity.Event,
  "1-59/5 * * * *": JobEntity.User,
  "2-59/5 * * * *": JobEntity.Attendance,
};

// spec-6 A5
function traceEnabled(): boolean {
  return process.env.TRACE_FETCH === "true";
}

// spec-6 A1
async function run(controller: IScheduledController): Promise<void> {
  const entity = schedules[controller.cron];

  if (!entity) {
    throw new Error(`No job for cron ${controller.cron}`);
  }

  await handler({ entity });
}

export default {
  async scheduled(controller: IScheduledController): Promise<void> {
    if (!traceEnabled()) {
      await run(controller);
      return;
    }

    timeUpstreamFetch();
    const startedAt = performance.now();

    try {
      await run(controller);
      logTiming("cronjob", "CRON", controller.cron, 200, startedAt);
    } catch (error) {
      logTiming("cronjob", "CRON", controller.cron, 500, startedAt);
      throw error;
    }
  },
};
