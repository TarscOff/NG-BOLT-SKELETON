import { Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { loadTheme } from '../main';
import { Store } from '@ngrx/store';
import { AppActions } from '@cadai/pxs-ng-core/store';
import { KeycloakService } from '@cadai/pxs-ng-core/services';

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

  private translate = inject(TranslateService);
  private kc = inject(KeycloakService);

  constructor(
    private store: Store
  ) {
    this.translate.addLangs(['fr', 'en']);
    this.translate.setFallbackLang('en');
    this.translate.use('en');
    loadTheme("light");
    this.store.dispatch(AppActions.AuthActions.hydrateFromKc());
  }
}
