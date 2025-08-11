import { Injectable } from '@angular/core';
import { Validators } from '@angular/forms';
import { FieldConfig } from '../../shared/forms/field-config.model';

@Injectable({ providedIn: 'root' })
export class FieldConfigService {

    getTextField(label = 'Username', placeholder = 'Enter username'): FieldConfig {
        return {
            name: 'input',
            label,
            type: 'text',
            required: true,
            minLength: 3,
            i18nKey: 'input',
            errorMessages: {
                required: 'form.errors.username.required',
                minlength: 'form.errors.username.minlength'
            },
            placeholder,
            layoutClass: '',
            helperText:"form.hints.input"
        };
    }

    getEmailField(label = 'Email', placeholder = 'Enter your email'): FieldConfig {
        return {
            name: 'email',
            label,
            type: 'email',
            required: true,
            i18nKey: 'email',
            validators: [Validators.email],
            errorMessages: {
                required: 'form.errors.email.required',
                email: 'form.errors.email.invalid'
            },
            placeholder,
            layoutClass: '',
            helperText:"form.hints.email"
        };
    }

    getPasswordField(label = 'Password', placeholder = 'Enter password'): FieldConfig {
        return {
            name: 'password',
            label,
            type: 'password',
            required: true,
            minLength: 8,
            pattern: '^(?=.*[A-Z])(?=.*\\d).{8,}$',
            i18nKey: 'password',
            errorMessages: {
                required: 'form.errors.password.required',
                minlength: 'form.errors.password.minlength',
                pattern: 'form.errors.password.pattern'
            },
            placeholder,
            layoutClass: '',
            helperText:"form.hints.password"
        };
    }

    getToggleField(label = 'Enable notifications'): FieldConfig {
        return {
            name: 'notify',
            label,
            type: 'toggle',
            layoutClass: '',
            helperText:"form.hints.notify",
            required: true,
            errorMessages: {
                required: 'form.errors.notify.required',
            },
        };
    }

    getDropdownField(label = 'Role', options = [{ label: 'Admin', value: 'admin' }, { label: 'User', value: 'user' }]): FieldConfig {
        return {
            name: 'role',
            label,
            type: 'dropdown',
            required: true,
            options,
            errorMessages: {
                required: 'form.errors.role.required'
            },
            layoutClass: '',

        };
    }

    getRangeField(label = 'Notification Volume', min = 0, max = 100, step = 5): FieldConfig {
        return {
            name: 'volume',
            label,
            type: 'range',
            min,
            max,
            step,
            layoutClass: 'col-md-12',
            i18nKey: "",
            required: true
        };
    }

    getDatepickerField(label = 'Date of Birth'): FieldConfig {
        return {
            name: 'dob',
            label,
            type: 'datepicker',
            required: true,
            i18nKey: 'dob',
            errorMessages: {
                required: 'form.errors.dob.required'
            },
            layoutClass: '',
        };
    }

    getChipsField(label = 'Tags', chipOptions = ['Angular', 'React', 'Vue']): FieldConfig {
        return {
            name: 'tags',
            label,
            type: 'chips',
            chipOptions,
            layoutClass: '',
            required: true,
            validators: [(c) => (Array.isArray(c.value) && c.value.length ? null : { required: true })],
            errorMessages: { required: 'form.errors.tags.required' },
            helperText:"form.hints.tags"

        };
    }

    getAutocompleteField(label = 'Country', options = ['Luxembourg', 'Germany', 'France']): FieldConfig {
        return {
            name: 'country',
            label,
            type: 'autocomplete',
            autocompleteOptions: options,
            layoutClass: '',
            required: true

        };
    }

    getPhoneField(label = 'Phone Number', placeholder = ''): FieldConfig {
        return {
            name: 'phone',
            label,
            type: 'phone',
            required: true,
            pattern: '^\\+?[0-9]{9,15}$',
            errorMessages: {
                required: 'form.errors.phone.required',
                pattern: 'form.errors.phone.invalid'
            },
            placeholder,
            layoutClass: ''
        };
    }

    getAllFields(): FieldConfig[] {
        return [
            this.getTextField(),
            this.getEmailField(),
            this.getPasswordField(),
            this.getPhoneField(),
            this.getToggleField(),
            this.getDropdownField(),
            this.getRangeField(),
            this.getDatepickerField(),
            this.getChipsField(),
            this.getAutocompleteField()
        ];
    }
}
