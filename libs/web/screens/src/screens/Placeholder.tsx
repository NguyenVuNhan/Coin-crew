import { Screen } from '../components/Screen';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Button } from '@cc/web-ui/components/Button';
import { APP_NAME } from '../config';

export function Placeholder() {
  return (
    <Screen title={APP_NAME}>
      <EmptyState
        title="Coming soon"
        action={
          <Button variant="secondary" href="/">
            Home
          </Button>
        }
      />
    </Screen>
  );
}
