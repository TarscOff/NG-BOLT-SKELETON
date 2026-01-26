import { Injectable } from '@angular/core';
import { FavoriteUrl, FavoriteType } from '@store/interfaces/favorites.model';

@Injectable({ providedIn: 'root' })
export class FavoritesStorageService {
  private readonly STORAGE_KEY = 'app_favorites_v1';

  loadFavorites(): FavoriteUrl[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      
      return parsed.filter(item => 
        item?.id && 
        item?.url && 
        item?.title && 
        typeof item?.timestamp === 'number' &&
        item?.favoriteType // Validate favoriteType exists
      );
    } catch (error) {
      console.error('[FavoritesStorage] Load failed:', error);
      return [];
    }
  }

  saveFavorites(favorites: FavoriteUrl[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('[FavoritesStorage] Save failed:', error);
      throw new Error('Failed to save favorites to storage');
    }
  }

  addFavorite(url: string, title: string, favoriteType: FavoriteType): FavoriteUrl {
    const favorites = this.loadFavorites();
    
    // Prevent duplicates
    const existing = favorites.find(f => f.url === url);
    if (existing) {
      throw new Error('URL already exists in favorites');
    }
    
    const newFavorite: FavoriteUrl = {
      id: this.generateId(),
      url: this.sanitizeUrl(url),
      title: title.trim(),
      timestamp: Date.now(),
      favoriteType,
    };
    
    favorites.push(newFavorite);
    this.saveFavorites(favorites);
    return newFavorite;
  }

  removeFavorite(id: string): void {
    const favorites = this.loadFavorites();
    const filtered = favorites.filter((f) => f.id !== id);
    
    if (filtered.length === favorites.length) {
      throw new Error('Favorite not found');
    }
    
    this.saveFavorites(filtered);
  }

  clearAll(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('[FavoritesStorage] Clear failed:', error);
      throw new Error('Failed to clear favorites');
    }
  }

  private generateId(): string {
    return `fav_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private sanitizeUrl(url: string): string {
    let sanitized = url.trim();
    if (!sanitized.startsWith('/')) {
      sanitized = '/' + sanitized;
    }
    return sanitized;
  }
}