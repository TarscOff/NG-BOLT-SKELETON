import { inject, Injectable } from '@angular/core';
import { HttpService } from './http.service';
import { Observable } from 'rxjs';
import { CreateUserDto, UpdateUserDto, User } from '../../store/features/user/user.model';
import { ConfigService } from './config.service';


@Injectable({ providedIn: 'root' })
export class UserService {
    private config = inject(ConfigService);

    constructor(private http: HttpService) { }

    private get base(): string {
        const apiUrl = this.config.get('apiUrl');
        if (!apiUrl) throw new Error('Runtime config missing: apiUrl');
        return `${apiUrl}/users`;
    }

    getAll(): Observable<User[]> {
        return this.http.get<User[]>(this.base);
    }

    getById(id: string): Observable<User> {
        return this.http.get<User>(`${this.base}/${id}`);
    }

    create(user: CreateUserDto): Observable<User> {
        return this.http.post<User, CreateUserDto>(this.base, user);
    }

    update(id: string, user: UpdateUserDto): Observable<User> {
        return this.http.put<User, UpdateUserDto>(`${this.base}/${id}`, user);
    }

    delete(id: string): Observable<void> {
        return this.http.delete<void>(`${this.base}/${id}`);
    }

    getCurrentUser(): Observable<User> {
        return this.http.get<User>(`${this.base}/me`);
    }
}