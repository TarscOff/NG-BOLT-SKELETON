import { Inject, Injectable } from "@angular/core";
import { CoreOptions } from "@cadai/pxs-ng-core/interfaces";
import { HttpService } from "@cadai/pxs-ng-core/services";
import { CORE_OPTIONS } from "@cadai/pxs-ng-core/tokens";
import { Observable } from "rxjs";
import { UserDto } from "../interfaces/user.model";

@Injectable({
    providedIn: 'root',
})
export class UserService {

    constructor(
        private http: HttpService,
        @Inject(CORE_OPTIONS) private readonly coreOpts: Required<CoreOptions>,
    ) { }

    /**
     * Get base API URL for templates
     */
    private get base(): string {
        const apiUrl = this.coreOpts.environments.apiUrl;
        if (!apiUrl) throw new Error('Runtime config missing: apiUrl');
        return `${apiUrl}`;
    }

    registerUser(displayName: string): Observable<UserDto> {
        const url = `${this.base}/users/register`;
        return this.http.post<UserDto>(url, {
            "displayName": displayName
        });
    }
}
