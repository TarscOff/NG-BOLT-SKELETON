import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamsComponent } from './teams.component';
import { of } from 'rxjs';
import { provideMockStore } from '@ngrx/store/testing';
import { MatDialog } from '@angular/material/dialog';
import { ToastService } from '../../core/services/toast.service';
import { LayoutService } from '../../core/services/layout.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// Mocks
const mockDialog = {
  open: () => ({
    afterClosed: () => of(true)
  })
};

const mockToast = {
  show: jasmine.createSpy('show')
};

const mockLayoutService = {
  setTitle: jasmine.createSpy('setTitle')
};

describe('TeamsComponent', () => {
  let component: TeamsComponent;
  let fixture: ComponentFixture<TeamsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamsComponent, NoopAnimationsModule, TranslateModule],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: ToastService, useValue: mockToast },
        { provide: LayoutService, useValue: mockLayoutService },
        {
          provide: TranslateService,
          useValue: {
            addLangs: jasmine.createSpy('addLangs'),
            setFallbackLang: jasmine.createSpy('setFallbackLang'),
            use: jasmine.createSpy('use'),
            get: jasmine.createSpy('get').and.returnValue(of('')),
            instant: jasmine.createSpy('instant').and.returnValue('')
          }
        }, provideMockStore({
          selectors: [
            { selector: 'selectTeamMembers', value: [] },
            { selector: 'selectTeamLoading', value: false }
          ]
        })
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TeamsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should dispatch removeTeamMember on confirmed delete', async () => {
    const store = TestBed.inject<Store>(Store);
    spyOn(store, 'dispatch');

    await component.removeMember({ id: 1, fullname: 'Test User', country: "country", dob: "", email: "", password: "", phone: "", role: "", tags: "" });

    expect(store.dispatch).toHaveBeenCalled();
  });

  it('should call layoutService.setTitle on onTitleChange', () => {
    component.onTitleChange('My Title');
    expect(mockLayoutService.setTitle).toHaveBeenCalledWith('My Title');
  });
});
