import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { ActionDefinitionLite } from '../templates/utils/workflow.interface';
import { CoreOptions } from '@cadai/pxs-ng-core/interfaces';
import { CORE_OPTIONS } from '@cadai/pxs-ng-core/tokens';

@Injectable({ providedIn: 'root' })
export class WorkflowsCatalogService {
  private fallback: ActionDefinitionLite[] = [
    { type: 'chat', params: { icon: 'chat' } },
    { type: 'compare', params: { icon: 'compare' } },
    { type: 'summarize', params: { icon: 'article_shortcut' } },
    { type: 'extract', params: { icon: 'tag' } },
    { type: 'jira', params: { icon: 'confirmation_number', class: 'warn' } },
    { type: 'embed', params: { icon: 'scatter_plot' } },
    { type: 'retrieve', params: { icon: 'travel_explore' } },
    { type: 'convert_and_chunk', params: { icon: 'description' } },
    { type: 'embed_langchain_documents', params: { icon: 'hive' } },
    { type: 'store_embedded_langchain_documents', params: { icon: 'inventory_2' } },
  ];

  constructor(
    private http: HttpClient,
    @Inject(CORE_OPTIONS) private readonly coreOpts: Required<CoreOptions>,
  ) { }

  loadCatalog(): Observable<ActionDefinitionLite[]> {
    const apiUrl = this.coreOpts.environments.apiUrl;
    if (!apiUrl) return of(this.fallback);
    const url = `${apiUrl}/workflows/catalog`;
    return this.http.get<ActionDefinitionLite[]>(url).pipe(
      map(list => {
        if (!Array.isArray(list)) return this.fallback;

        // Merge API list with fallback to guarantee baseline nodes (no duplicates by type)
        const mergedByType = new Map<string, ActionDefinitionLite>();
        for (const item of this.fallback) mergedByType.set(item.type, item);
        for (const item of list) mergedByType.set(item.type, item);
        return Array.from(mergedByType.values());
      }),
      catchError(() => of(this.fallback)),
    );
  }
}
