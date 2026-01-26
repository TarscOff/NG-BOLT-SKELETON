
export interface FavoritesState {
  favorites: FavoriteUrl[];
  loading: boolean;
  error?: string;
}

export interface FavoriteUrl {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  favoriteType: FavoriteType;
}

export enum FavoriteType {
  PROJECT = 'project',
  CHAT = 'chat',
  EXTRACT='extract',
  COMPARE='compare',
  SUMMARIZE='summarize'
}
