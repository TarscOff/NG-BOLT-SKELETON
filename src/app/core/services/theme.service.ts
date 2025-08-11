import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _isDark = signal<boolean>(false);
  public isDark = this._isDark.asReadonly();

  constructor() {
    const storedTheme = localStorage.getItem('theme');
    const isDark = storedTheme === 'dark';
    this._isDark.set(isDark);
    this.setTheme(isDark);
  }

  toggleTheme(): void {
    const newDark = !this._isDark();
    this._isDark.set(newDark);
    this.setTheme(newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  }

  private setTheme(isDark: boolean): void {
    const themeLink = document.getElementById('theme-style') as HTMLLinkElement;
    themeLink.href = isDark ? 'assets/theme/dark.css' : 'assets/theme/light.css';

    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(isDark ? 'dark' : 'light');
  }
}