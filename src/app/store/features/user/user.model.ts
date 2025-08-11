export interface User {
  id: string;
  name?: string;
  email?: string;
  role?: 'admin' | 'user' | 'guest';
}

export interface UserState {
  user: User | null;
  users: User[];
  loading: boolean;
  error: string | null;
}


export type CreateUserDto = Omit<User, 'id'>;
export type UpdateUserDto = Partial<Omit<User, 'id'>>;