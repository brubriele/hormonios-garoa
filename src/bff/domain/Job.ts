export enum JobEntity {
  Event = "event",
  User = "user",
  Attendance = "attendance",
}

export class Job {
  constructor(readonly entity: JobEntity) {}
}
