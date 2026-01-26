import { Component, computed, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { SeoComponent } from '@cadai/pxs-ng-core/shared';
import { LayoutService } from '@cadai/pxs-ng-core/services';
import { MatRadioModule } from '@angular/material/radio';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';

export interface Task {
  name: string;
  completed: boolean;
  subtasks?: Task[];
}

@Component({
  selector: 'app-components',
  standalone: true,
  imports: [
    SeoComponent,
    MatIcon,
    TranslateModule,
    MatListModule,
    CommonModule,
    MatButtonModule,
    MatRadioModule,
    MatGridListModule,
    MatTabsModule,
    MatCheckboxModule
  ],
  templateUrl: './components.component.html',
  styleUrls: ['./components.component.scss']
})
export class CustomComponentsComponent {
  readonly task = signal<Task>({
    name: 'Parent task',
    completed: false,
    subtasks: [
      { name: 'Child task 1', completed: false },
      { name: 'Child task 2', completed: false },
      { name: 'Child task 3', completed: false },
    ],
  });

  readonly partiallyComplete = computed(() => {
    const task = this.task();
    if (!task.subtasks) {
      return false;
    }
    return task.subtasks.some(t => t.completed) && !task.subtasks.every(t => t.completed);
  });

  update(completed: boolean, index?: number) {
    this.task.update(task => {
      if (index === undefined) {
        task.completed = completed;
        task.subtasks?.forEach(t => (t.completed = completed));
      } else {
        task.subtasks![index].completed = completed;
        task.completed = task.subtasks?.every(t => t.completed) ?? true;
      }
      return { ...task };
    });
  }

  constructor(
    private layoutService: LayoutService
  ) { }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }
}
