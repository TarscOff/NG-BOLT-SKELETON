# Favorites — Configuration, Management and Contribution Guide
>
>_Last updated: 2026-01-13_

_This document explains the Favorites feature architecture, NgRx state management, storage mechanisms, and how to integrate favorites functionality into new components._

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [NgRx State Management](#ngrx-state-management)
5. [Services Layer](#services-layer)
6. [Usage in Components](#usage-in-components)
7. [Real-World Examples](#real-world-examples)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## 1. Overview

The Favorites feature allows users to bookmark URLs across different feature types (projects, chat sessions, extracts, comparisons, and summaries). All favorites are:

- **Persisted** to `localStorage` for cross-session availability
- **Managed** via NgRx for reactive state management
- **Type-safe** with TypeScript interfaces and enums
- **Toast-notified** for user feedback on all operations

### Supported Favorite Types

```typescript
enum FavoriteType {
  PROJECT = 'project',
  CHAT = 'chat',
  EXTRACT = 'extract',
  COMPARE = 'compare',
  SUMMARIZE = 'summarize'
}
```

---

## 2. Architecture

The Favorites feature follows a **layered architecture**:

```
┌─────────────────────────────────────────────┐
│         Components (UI Layer)                │
│   - FavoritesComponent                       │
│   - DetailsComponent                         │
│   - SessionsComponent                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      Facade Service (Abstraction Layer)      │
│   - FavoritesFacade                          │
│   - Exposes Observables & Dispatch Methods   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         NgRx Store (State Layer)             │
│   - Actions                                  │
│   - Reducer                                  │
│   - Selectors                                │
│   - Effects                                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│    Storage Service (Persistence Layer)       │
│   - FavoritesStorageService                  │
│   - LocalStorage operations                  │
└─────────────────────────────────────────────┘
```

---

## 3. Data Models

### Location
`src/app/store/interfaces/favorites.model.ts`

### Interfaces

```typescript
export interface FavoritesState {
  favorites: FavoriteUrl[];
  loading: boolean;
  error?: string;
}

export interface FavoriteUrl {
  id: string;              // Unique identifier (generated)
  url: string;             // The bookmarked URL
  title: string;           // Display title
  timestamp: number;       // Unix timestamp (for sorting)
  favoriteType: FavoriteType;  // Category
}

export enum FavoriteType {
  PROJECT = 'project',
  CHAT = 'chat',
  EXTRACT = 'extract',
  COMPARE = 'compare',
  SUMMARIZE = 'summarize'
}
```

---

## 4. NgRx State Management

### Registration

The favorites store is registered **globally** in `app.config.ts`:

```typescript
// src/app/app.config.ts
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { FavoritesReducer, FavoritesEffects } from '@store';

export const appConfig = {
  providers: [
    provideState("favorites", FavoritesReducer),
    provideEffects(FavoritesEffects),
    // ... other providers
  ],
};
```

### Actions

**Location:** `src/app/store/favorites/favorites.actions.ts`

| Action | Purpose | Payload |
|--------|---------|---------|
| `loadFavorites` | Load all favorites from storage | None |
| `loadFavoritesSuccess` | Store loaded favorites | `{ favorites: FavoriteUrl[] }` |
| `loadFavoritesFailure` | Handle load errors | `{ error: string }` |
| `addFavorite` | Add a new favorite | `{ url: string, title: string, favoriteType: FavoriteType }` |
| `addFavoriteSuccess` | Confirm addition | `{ favorite: FavoriteUrl }` |
| `addFavoriteFailure` | Handle add errors | `{ error: string }` |
| `removeFavorite` | Remove a favorite | `{ id: string }` |
| `removeFavoriteSuccess` | Confirm removal | `{ id: string }` |
| `removeFavoriteFailure` | Handle remove errors | `{ error: string }` |
| `clearFavorites` | Clear all favorites | None |
| `clearFavoritesSuccess` | Confirm clear | None |
| `clearFavoritesFailure` | Handle clear errors | `{ error: string }` |

### Selectors

**Location:** `src/app/store/favorites/favorites.selectors.ts`

#### Basic Selectors
```typescript
selectFavorites           // All favorites
selectLoading             // Loading state
selectError               // Error message
selectFavoritesCount      // Total count
selectHasFavorites        // Boolean check
selectSortedFavorites     // Sorted by timestamp (newest first)
```

#### Parameterized Selectors
```typescript
selectFavoriteById(id: string)              // Find by ID
selectIsFavorite(url: string)               // Check if URL is favorited
selectFavoritesByType(type: FavoriteType)   // Filter by type
```

#### Computed Selectors
```typescript
selectGroupedFavorites       // Grouped by FavoriteType
selectFavoritesCountByType   // Count per type
selectFavoritesWithLoading   // Combined with loading state
```

### Effects

**Location:** `src/app/store/favorites/favorites.effects.ts`

- `loadFavoritesEffect` - Loads from storage on app init
- `addFavoriteEffect` - Adds to storage and state
- `removeFavoriteEffect` - Removes from storage and state
- `clearFavoritesEffect` - Clears storage completely
- `toastSuccessEffect` - Shows success notifications
- `toastErrorEffect` - Shows error notifications

---

## 5. Services Layer

### FavoritesFacade

**Location:** `src/app/shared/services/favorites.facade.ts`

The facade provides a **simple API** for components, hiding NgRx complexity.

#### Observable Properties
```typescript
favorites$: Observable<FavoriteUrl[]>
sortedFavorites$: Observable<FavoriteUrl[]>
loading$: Observable<boolean>
error$: Observable<string | undefined>
count$: Observable<number>
hasFavorites$: Observable<boolean>
groupedFavorites$: Observable<Record<FavoriteType, FavoriteUrl[]>>
favoritesCountByType$: Observable<Record<FavoriteType, number>>
```

#### Action Methods
```typescript
loadFavorites(): void
addFavorite(url: string, title: string, favoriteType: FavoriteType): void
removeFavorite(id: string): void
clearAll(): void
```

#### Dynamic Selectors
```typescript
getFavoriteById(id: string): Observable<FavoriteUrl | undefined>
isFavorite(url: string): Observable<boolean>
getFavoritesByType(type: FavoriteType): Observable<FavoriteUrl[]>
```

### FavoritesStorageService

**Location:** `src/app/shared/services/favorites.service.ts`

Handles **localStorage** persistence with error handling.

#### Key Methods
```typescript
loadFavorites(): FavoriteUrl[]
saveFavorites(favorites: FavoriteUrl[]): void
addFavorite(url: string, title: string, favoriteType: FavoriteType): FavoriteUrl
removeFavorite(id: string): void
clearAll(): void
```

#### Features
- **Duplicate prevention**: Checks existing URLs before adding
- **URL sanitization**: Ensures URLs start with `/`
- **Data validation**: Validates structure before loading
- **Error handling**: Throws descriptive errors

---

## 6. Usage in Components

### Step 1: Inject the Facade

```typescript
import { inject } from '@angular/core';
import { FavoritesFacade } from '@shared/services/favorites.facade';
import { FavoriteType } from '@store/interfaces/favorites.model';

export class MyComponent {
  private favoritesFacade = inject(FavoritesFacade);
}
```

### Step 2: Load Favorites (OnInit)

```typescript
ngOnInit(): void {
  this.favoritesFacade.loadFavorites();
}
```

### Step 3: Subscribe to State

#### Using Signals (Recommended for Angular 19)
```typescript
import { toSignal } from '@angular/core/rxjs-interop';

readonly favorites = toSignal(this.favoritesFacade.sortedFavorites$, { 
  initialValue: [] 
});
readonly loading = toSignal(this.favoritesFacade.loading$, { 
  initialValue: false 
});
readonly isFavorite = toSignal(
  this.favoritesFacade.isFavorite(this.currentUrl() || ''),
  { initialValue: false }
);
```

#### Using Observables with Async Pipe
```html
<div *ngIf="favoritesFacade.loading$ | async">Loading...</div>
<div *ngFor="let fav of favoritesFacade.sortedFavorites$ | async">
  {{ fav.title }}
</div>
```

### Step 4: Dispatch Actions

#### Add Favorite
```typescript
addToFavorites(): void {
  const url = this.router.url;
  const title = 'My Project';
  const type = FavoriteType.PROJECT;
  
  this.favoritesFacade.addFavorite(url, title, type);
}
```

#### Remove Favorite
```typescript
removeFromFavorites(favoriteId: string): void {
  this.favoritesFacade.removeFavorite(favoriteId);
}
```

#### Check if Favorited
```typescript
checkIfFavorited(): void {
  const url = this.router.url;
  
  this.favoritesFacade.isFavorite(url).subscribe(isFav => {
    console.log('Is favorited:', isFav);
  });
}
```

#### Clear All Favorites
```typescript
async clearAll(): Promise<void> {
  const confirmed = await this.confirmDialog();
  if (confirmed) {
    this.favoritesFacade.clearAll();
  }
}
```

---

## 7. Real-World Examples

### Example 1: Project Details Page

**Scenario:** Add/remove project from favorites in toolbar

```typescript
// src/app/features/projects/pages/details/details.component.ts

private favoritesFacade = inject(FavoritesFacade);

private updateToolbarWithFavorites(): void {
  const url = this.router.url;
  
  this.favoritesFacade.isFavorite(url).subscribe(isFavorited => {
    const favoriteAction: ToolbarAction = isFavorited
      ? {
          id: 'remove-favorite',
          icon: 'favorite',
          tooltip: 'Remove from favorites',
          class: 'error',
          click: () => this.handleRemoveFavorite(),
        }
      : {
          id: 'add-favorite',
          icon: 'favorite_border',
          tooltip: 'Add to favorites',
          class: 'primary',
          click: () => this.handleAddFavorite(),
        };
    
    this.toolbarService.setActions([favoriteAction]);
  });
}

private handleAddFavorite(): void {
  const url = this.router.url;
  const project = this.project();
  
  if (!url || !project) return;
  
  const title = project.name || 'Untitled Project';
  this.favoritesFacade.addFavorite(url, title, FavoriteType.PROJECT);
  
  setTimeout(() => this.updateToolbarWithFavorites(), 100);
}

private handleRemoveFavorite(): void {
  const url = this.router.url;
  
  firstValueFrom(this.favoritesFacade.favorites$).then(allFavorites => {
    const matchingFavorite = allFavorites.find(fav => fav.url === url);
    if (matchingFavorite) {
      this.favoritesFacade.removeFavorite(matchingFavorite.id);
      setTimeout(() => this.updateToolbarWithFavorites(), 100);
    }
  });
}
```

### Example 2: Session Favorite Toggle

**Scenario:** Add/remove individual chat sessions from favorites

```typescript
// Check if session is favorited
isFavoriteSession(sessionId: string): boolean {
  const projectId = this.project()?.project_id;
  if (!projectId) return false;
  
  const sessionUrl = `/genai-projects/${projectId}/sessions/${sessionId}`;
  return this.favoriteSessionUrls().some(fav => fav.url === sessionUrl);
}

// Toggle favorite state
async toggleSessionFavorite(session: HistoryItem): Promise<void> {
  const projectId = this.project()?.project_id;
  if (!projectId) return;
  
  const sessionUrl = `/genai-projects/${projectId}/sessions/${session.id}`;
  const isFavorited = this.isFavoriteSession(session.id);
  
  if (isFavorited) {
    // Remove from favorites
    const favorite = this.favoriteSessionUrls().find(fav => fav.url === sessionUrl);
    if (favorite) {
      const confirmed = await this.confirmRemoval(session.title);
      if (!confirmed) return;
      
      this.favoritesFacade.removeFavorite(favorite.id);
    }
  } else {
    // Add to favorites
    const title = session.title || 'New Session';
    this.favoritesFacade.addFavorite(sessionUrl, title, FavoriteType.CHAT);
  }
}
```

### Example 3: Batch Add to Favorites

**Scenario:** Add all sessions to favorites at once

```typescript
async addAllSessionsToFavorites(): Promise<void> {
  const projectId = this.project()?.project_id;
  if (!projectId) return;
  
  const confirmed = await this.confirmBatchAdd(this.sessionsCount());
  if (!confirmed) return;
  
  this.sessionsHistory().forEach(session => {
    if (!this.isFavoriteSession(session.id)) {
      const sessionUrl = `/genai-projects/${projectId}/sessions/${session.id}`;
      const title = session.title || 'New Session';
      this.favoritesFacade.addFavorite(sessionUrl, title, FavoriteType.CHAT);
    }
  });
  
  this.toast.show('All sessions added to favorites');
}
```

### Example 4: Favorites Page Display

**Scenario:** Display grouped favorites by type

```typescript
// src/app/features/favorites/favorites.component.ts

readonly groupedFavorites = toSignal(this.favoritesFacade.groupedFavorites$, { 
  initialValue: {
    [FavoriteType.PROJECT]: [],
    [FavoriteType.CHAT]: [],
    [FavoriteType.EXTRACT]: [],
    [FavoriteType.COMPARE]: [],
    [FavoriteType.SUMMARIZE]: [],
  } 
});

readonly favoritesCountByType = toSignal(
  this.favoritesFacade.favoritesCountByType$,
  { initialValue: { /* ... */ } }
);

ngOnInit(): void {
  this.favoritesFacade.loadFavorites();
}
```

**Template:**
```html
<mat-tab-group>
  <mat-tab>
    <ng-template mat-tab-label>
      Projects ({{ favoritesCountByType()[FavoriteType.PROJECT] }})
    </ng-template>
    
    @for (fav of groupedFavorites()[FavoriteType.PROJECT]; track fav.id) {
      <div class="favorite-item">
        <a [routerLink]="fav.url">{{ fav.title }}</a>
        <button (click)="removeFavorite(fav.id)">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    }
  </mat-tab>
  
  <mat-tab>
    <ng-template mat-tab-label>
      Chats ({{ favoritesCountByType()[FavoriteType.CHAT] }})
    </ng-template>
    <!-- Similar structure -->
  </mat-tab>
</mat-tab-group>
```

---

## 8. Best Practices

### ✅ Do's

1. **Always use the Facade** - Don't dispatch actions or select from store directly
2. **Load on init** - Call `loadFavorites()` in `ngOnInit()` of relevant components
3. **Use signals** - Convert observables to signals for better performance in Angular 19
4. **Validate before adding** - Check if URL already exists to prevent duplicates
5. **Provide user feedback** - Effects automatically show toasts, but consider additional UX
6. **Use FavoriteType enum** - Never hardcode type strings
7. **Handle errors gracefully** - Subscribe to `error$` and display appropriate messages
8. **Confirm destructive actions** - Use dialogs before removing or clearing favorites

### ❌ Don'ts

1. **Don't mutate state directly** - Always use facade methods
2. **Don't bypass storage service** - Let effects handle persistence
3. **Don't forget to specify favoriteType** - Every favorite must have a type
4. **Don't hardcode URLs** - Build them dynamically from route parameters
5. **Don't ignore loading states** - Show spinners/skeletons during operations
6. **Don't duplicate favorites** - Check `isFavorite()` before adding
7. **Don't forget cleanup** - Unsubscribe or use signals to prevent memory leaks

### 🎯 Performance Tips

1. **Use `toSignal`** instead of `async` pipe for better change detection
2. **Compute derived state** with `computed()` signals
3. **Lazy load favorites** - Only load when navigating to favorites-dependent routes
4. **Debounce rapid operations** - Use `setTimeout` after add/remove to batch UI updates
5. **Track by `id`** in `@for` loops to optimize rendering

---

## 9. Troubleshooting

### Issue: Favorites not persisting across sessions

**Cause:** localStorage is disabled or browser in private mode

**Solution:**
```typescript
// Add error handling in storage service
try {
  localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favorites));
} catch (error) {
  console.error('Storage unavailable:', error);
  // Fallback to in-memory storage or notify user
}
```

### Issue: Duplicate favorites appearing

**Cause:** Not checking existence before adding

**Solution:**
```typescript
// Always check before adding
this.favoritesFacade.isFavorite(url).subscribe(exists => {
  if (!exists) {
    this.favoritesFacade.addFavorite(url, title, type);
  }
});
```

### Issue: Favorites not updating in UI

**Cause:** Not refreshing toolbar/view after state change

**Solution:**
```typescript
// Add slight delay to let store update
this.favoritesFacade.addFavorite(url, title, type);
setTimeout(() => this.updateToolbarWithFavorites(), 100);
```

### Issue: Cannot find favorite to remove

**Cause:** Using URL instead of ID for removal

**Solution:**
```typescript
// First find the favorite by URL, then remove by ID
firstValueFrom(this.favoritesFacade.favorites$).then(allFavorites => {
  const favorite = allFavorites.find(fav => fav.url === targetUrl);
  if (favorite) {
    this.favoritesFacade.removeFavorite(favorite.id);
  }
});
```

---

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

---

## 📚 Related Documentation

- [README-CONTRIBUTING.NGRX.md](README-CONTRIBUTING.NGRX.md) - NgRx contribution guide
- [README-LAYOUT.md](README-LAYOUT.md) - Layout and toolbar configuration
- [README-OVERVIEW.md](README-OVERVIEW.md) - Project architecture overview
