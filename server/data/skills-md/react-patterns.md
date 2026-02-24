---
name: react-patterns
description: React component patterns, hooks best practices, and performance optimization techniques
emoji: "\U0000269B"
name_zh: React 模式
description_zh: React 组件模式与最佳实践
---

## React Patterns & Best Practices

Practical patterns for building maintainable, performant React applications with modern hooks-based architecture.

## Component Design Principles

### 1. Single Responsibility

Each component should do one thing well. If a component file exceeds ~150 lines, consider splitting it.

```jsx
// BAD: UserDashboard handles data fetching, filtering, rendering
function UserDashboard() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  // ... 200 lines of mixed concerns
}

// GOOD: Split into focused components
function UserDashboard() {
  return (
    <UserProvider>
      <UserFilter />
      <UserList />
      <UserStats />
    </UserProvider>
  );
}
```

### 2. Composition Over Configuration

Prefer composable children over massive prop lists:

```jsx
// BAD: prop explosion
<Card
  title="Settings"
  subtitle="Manage your account"
  icon={<SettingsIcon />}
  actions={[{ label: 'Save', onClick: handleSave }]}
  footer="Last updated: today"
/>

// GOOD: composable
<Card>
  <Card.Header>
    <SettingsIcon />
    <Card.Title>Settings</Card.Title>
    <Card.Subtitle>Manage your account</Card.Subtitle>
  </Card.Header>
  <Card.Body>{children}</Card.Body>
  <Card.Footer>
    <Button onClick={handleSave}>Save</Button>
  </Card.Footer>
</Card>
```

## Hook Patterns

### Custom Hooks for Reusable Logic

Extract stateful logic into custom hooks:

```jsx
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function SearchBar() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (debouncedQuery) searchAPI(debouncedQuery);
  }, [debouncedQuery]);
}
```

### useCallback and useMemo

Use `useCallback` for functions passed as props to memoized children. Use `useMemo` for expensive computations.

```jsx
function ParentComponent({ items }) {
  // Memoize expensive computation
  const sortedItems = useMemo(
    () => items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  // Stabilize callback reference
  const handleSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  return <ItemList items={sortedItems} onSelect={handleSelect} />;
}

const ItemList = React.memo(({ items, onSelect }) => {
  // Only re-renders when items or onSelect reference changes
  return items.map(item => (
    <Item key={item.id} item={item} onSelect={onSelect} />
  ));
});
```

### useRef for Mutable Values

```jsx
function Timer() {
  const intervalRef = useRef(null);
  const countRef = useRef(0);

  const start = useCallback(() => {
    intervalRef.current = setInterval(() => {
      countRef.current += 1;
      // Use ref when you need the value without causing re-renders
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);
}
```

## State Management Patterns

### Lift State Up (When Simple)

```jsx
function App() {
  const [selectedTab, setSelectedTab] = useState('home');

  return (
    <>
      <TabBar selected={selectedTab} onSelect={setSelectedTab} />
      <TabContent tab={selectedTab} />
    </>
  );
}
```

### Context for Cross-Cutting Concerns

```jsx
const ThemeContext = createContext();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  const value = useMemo(() => ({
    theme,
    toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light'),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```

### useReducer for Complex State

```jsx
const initialState = { items: [], loading: false, error: null };

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.payload] };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

function Cart() {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  // dispatch({ type: 'ADD_ITEM', payload: item })
}
```

## Performance Optimization

### Avoid Unnecessary Re-Renders

```jsx
// BAD: creates a new object every render, defeating React.memo
<UserCard style={{ marginTop: 10 }} user={user} />

// GOOD: stable reference
const cardStyle = useMemo(() => ({ marginTop: 10 }), []);
<UserCard style={cardStyle} user={user} />
```

### Lazy Loading

```jsx
const AdminPanel = React.lazy(() => import('./AdminPanel'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      {isAdmin && <AdminPanel />}
    </Suspense>
  );
}
```

### Virtualized Lists

For lists with hundreds of items, use virtualization:

```jsx
import { FixedSizeList } from 'react-window';

function VirtualList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style}>{items[index].name}</div>
  );

  return (
    <FixedSizeList
      height={400}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

## Error Handling

### Error Boundaries

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary>
  <FeatureComponent />
</ErrorBoundary>
```

## File Organization

```
src/
  components/
    ui/                 # Reusable UI primitives (Button, Modal, Input)
    features/           # Feature-specific components
  hooks/                # Custom hooks
  contexts/             # React context providers
  utils/                # Pure utility functions
  services/             # API calls, external integrations
  types/                # TypeScript type definitions
  constants/            # App-wide constants
```

## Common Pitfalls

1. **Stale closures**: Use refs or functional state updates when accessing latest values in callbacks
2. **Missing cleanup**: Always return cleanup functions from useEffect for subscriptions/timers
3. **Unstable references**: Objects/arrays/functions created during render break memoization
4. **Infinite loops**: Ensure useEffect dependencies are stable; don't set state that triggers the same effect
5. **Direct DOM manipulation**: Prefer React state over manual DOM changes; use refs only when necessary
