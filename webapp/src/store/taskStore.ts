import { create } from 'zustand';
import type { Task, TaskStatus } from '../types';

interface TaskStoreState {
  tasks: Task[];
  currentTask: Task | null;
  loading: boolean;
  totalTasks: number;
  currentPage: number;
  pageSize: number;
  filterStatus: TaskStatus | '';
  filterQuery: string;

  setTasks: (tasks: Task[], total: number) => void;
  setCurrentTask: (task: Task | null) => void;
  updateTaskProgress: (
    id: number,
    updates: Partial<Pick<Task, 'status' | 'progress' | 'stage' | 'error_msg'>>
  ) => void;
  setLoading: (loading: boolean) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setFilterStatus: (status: TaskStatus | '') => void;
  setFilterQuery: (q: string) => void;
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  tasks: [],
  currentTask: null,
  loading: false,
  totalTasks: 0,
  currentPage: 1,
  pageSize: 20,
  filterStatus: '',
  filterQuery: '',

  setTasks: (tasks, total) => set({ tasks, totalTasks: total }),

  setCurrentTask: (task) => set({ currentTask: task }),

  updateTaskProgress: (id, updates) =>
    set((state) => {
      const updatedTasks = state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      );
      const updatedCurrent =
        state.currentTask?.id === id
          ? { ...state.currentTask, ...updates }
          : state.currentTask;
      return { tasks: updatedTasks, currentTask: updatedCurrent };
    }),

  setLoading: (loading) => set({ loading }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterQuery: (q) => set({ filterQuery: q }),
}));
