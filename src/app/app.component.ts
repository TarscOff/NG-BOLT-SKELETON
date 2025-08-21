import { Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { loadTheme } from '../main';
import { Store } from '@ngrx/store';
import { AppActions } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  title = 'ai-product';

  private translate = inject(TranslateService);

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
