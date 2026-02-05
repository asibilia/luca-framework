export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fixCommand: string | null;
  details: string | null;
}

export interface DoctorCheck {
  name: string;
  run(): Promise<CheckResult>;
}
