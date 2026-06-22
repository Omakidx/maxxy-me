# Component Scaffolder — Code Generation

Scaffolding templates for UI components across React, Vue, Svelte, and Angular.
Every scaffold includes TypeScript, accessibility, and test file.

---

## React (TypeScript + Tailwind)

### Functional Component
```tsx
import { type FC } from 'react';

interface {{ComponentName}}Props {
  /** Primary content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const {{ComponentName}}: FC<{{ComponentName}}Props> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`{{base-classes}} ${className}`}>
      {children}
    </div>
  );
};
```

### Component with State + Refs
```tsx
import { useState, useRef, useCallback, type FC } from 'react';

interface {{ComponentName}}Props {
  initialValue?: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export const {{ComponentName}}: FC<{{ComponentName}}Props> = ({
  initialValue = '',
  onSubmit,
  disabled = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
        setValue('');
        inputRef.current?.focus();
      }
    },
    [value, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} role="form" aria-label="{{form-label}}">
      <label htmlFor="{{input-id}}">{{Label}}</label>
      <input
        ref={inputRef}
        id="{{input-id}}"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-required="true"
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Submit
      </button>
    </form>
  );
};
```

### Modal / Dialog Component
```tsx
import { useEffect, useRef, type FC } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else {
      dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      className="rounded-lg p-6 backdrop:bg-black/50"
    >
      <header className="flex items-center justify-between mb-4">
        <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="p-1 rounded hover:bg-gray-100"
        >
          ✕
        </button>
      </header>
      <div>{children}</div>
    </dialog>
  );
};
```

### Custom Hook
```tsx
import { useState, useEffect, useCallback } from 'react';

interface Use{{HookName}}Options {
  /** Configuration option */
  enabled?: boolean;
}

interface Use{{HookName}}Return {
  data: {{DataType}} | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function use{{HookName}}(
  options: Use{{HookName}}Options = {}
): Use{{HookName}}Return {
  const { enabled = true } = options;
  const [data, setData] = useState<{{DataType}} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await {{fetchFunction}}();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
```

---

## Vue 3 (Composition API + TypeScript)

### Single File Component
```vue
<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  title: string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
});

const emit = defineEmits<{
  (e: 'update', value: number): void;
  (e: 'close'): void;
}>();

const localCount = ref(props.count);
const isActive = computed(() => localCount.value > 0);

function increment() {
  localCount.value++;
  emit('update', localCount.value);
}
</script>

<template>
  <div :class="['component', { active: isActive }]">
    <h2>{{ title }}</h2>
    <p>Count: {{ localCount }}</p>
    <button @click="increment" :aria-label="`Increment count, currently ${localCount}`">
      +1
    </button>
    <button @click="$emit('close')" aria-label="Close">
      ✕
    </button>
  </div>
</template>

<style scoped>
.component { padding: 1rem; }
.active { border-left: 3px solid var(--color-primary); }
</style>
```

### Vue Composable
```typescript
import { ref, onMounted, onUnmounted } from 'vue';

export function use{{ComposableName}}() {
  const data = ref<{{DataType}} | null>(null);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  async function fetch() {
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await {{fetchFunction}}();
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Unknown error');
    } finally {
      isLoading.value = false;
    }
  }

  onMounted(fetch);

  return { data, isLoading, error, refetch: fetch };
}
```

---

## Svelte 5 (Runes)

### Component
```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
    onUpdate?: (value: number) => void;
  }

  let { title, count = 0, onUpdate }: Props = $props();
  let localCount = $state(count);
  let isActive = $derived(localCount > 0);

  function increment() {
    localCount++;
    onUpdate?.(localCount);
  }
</script>

<div class="component" class:active={isActive}>
  <h2>{title}</h2>
  <p>Count: {localCount}</p>
  <button onclick={increment} aria-label={`Increment count, currently ${localCount}`}>
    +1
  </button>
</div>

<style>
  .component { padding: 1rem; }
  .active { border-left: 3px solid var(--color-primary); }
</style>
```

---

## Angular

### Component
```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-{{component-name}}',
  standalone: true,
  template: `
    <div [class.active]="isActive">
      <h2>{{ title }}</h2>
      <p>Count: {{ count }}</p>
      <button (click)="increment()" [attr.aria-label]="'Count: ' + count">
        +1
      </button>
    </div>
  `,
  styles: [`
    .active { border-left: 3px solid var(--color-primary); }
  `],
})
export class {{ComponentName}}Component {
  @Input() title = '';
  @Input() count = 0;
  @Output() countChange = new EventEmitter<number>();

  get isActive(): boolean {
    return this.count > 0;
  }

  increment(): void {
    this.count++;
    this.countChange.emit(this.count);
  }
}
```

---

## Component Test (React + Testing Library)

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { {{ComponentName}} } from './{{ComponentName}}';

expect.extend(toHaveNoViolations);

describe('{{ComponentName}}', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
  };

  it('renders correctly', () => {
    render(<{{ComponentName}} {...defaultProps}>Content</{{ComponentName}}>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<{{ComponentName}} {...defaultProps} />);

    await user.type(screen.getByRole('textbox'), 'test value');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith('test value');
  });

  it('respects disabled state', () => {
    render(<{{ComponentName}} {...defaultProps} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<{{ComponentName}} {...defaultProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

---

## File Naming Convention

```
src/components/
  {{ComponentName}}/
    {{ComponentName}}.tsx          # Component implementation
    {{ComponentName}}.test.tsx     # Tests
    {{ComponentName}}.stories.tsx  # Storybook (optional)
    index.ts                       # Barrel export
```

```typescript
// index.ts
export { {{ComponentName}} } from './{{ComponentName}}';
export type { {{ComponentName}}Props } from './{{ComponentName}}';
```
