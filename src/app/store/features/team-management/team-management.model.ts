export interface TeamMember {
  id: number;
  fullname: string;
  email: string;
  role: string;
  dob: string;
  phone: string;
  country: string;
  password: string;
  tags: string;
}

export interface TeamManagementState {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
}