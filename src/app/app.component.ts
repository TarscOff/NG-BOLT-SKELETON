import { Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppActions, AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  title = 'psx-ng-skeleton';

  constructor(
    private store: Store,
  ) {
    this.store.dispatch(AppActions.AuthActions.hydrateFromKc());
    this.store.select(AppSelectors.ThemeSelectors.selectIsDark).subscribe(isDark => {
      this.store.dispatch(AppActions.ThemeActions.setTheme({ mode: isDark ? 'dark' : 'light' }));
    });
  }
}
