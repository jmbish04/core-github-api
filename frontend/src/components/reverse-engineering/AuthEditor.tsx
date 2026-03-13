import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ReverseEngineeringAuth } from './api';

interface AuthEditorProps {
  value?: ReverseEngineeringAuth;
  onChange: (value?: ReverseEngineeringAuth) => void;
}

function parseCookies(raw: string): ReverseEngineeringAuth['cookies'] | undefined {
  if (!raw.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function cookiesToText(value?: ReverseEngineeringAuth['cookies']): string {
  return value?.length ? JSON.stringify(value, null, 2) : '';
}

export function AuthEditor({ value, onChange }: AuthEditorProps) {
  const type = value?.type || 'custom_header';

  const update = (patch: ReverseEngineeringAuth) => {
    onChange({ ...(value || {}), ...patch });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Authentication method</Label>
        <Select
          value={type}
          onValueChange={(next) =>
            onChange({
              type: next as NonNullable<ReverseEngineeringAuth>['type'],
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an authentication method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom_header">Custom header</SelectItem>
            <SelectItem value="bearer_header">Bearer token</SelectItem>
            <SelectItem value="basic_auth">Basic auth</SelectItem>
            <SelectItem value="cookie">Cookies</SelectItem>
            <SelectItem value="query_param">Query param</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === 'custom_header' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Header name</Label>
            <Input
              value={value?.headerName || 'x-api-key'}
              onChange={(event) => update({ type, headerName: event.target.value })}
              placeholder="x-api-key"
            />
          </div>
          <div className="space-y-2">
            <Label>Header value</Label>
            <Input
              value={value?.headerValue || ''}
              onChange={(event) => update({ type, headerValue: event.target.value })}
              placeholder="Paste the header value"
            />
          </div>
        </div>
      )}

      {type === 'bearer_header' && (
        <div className="space-y-2">
          <Label>Bearer token</Label>
          <Input
            value={value?.headerValue || ''}
            onChange={(event) => update({ type, headerName: 'Authorization', headerValue: event.target.value })}
            placeholder="Paste the bearer token"
          />
        </div>
      )}

      {type === 'basic_auth' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={value?.username || ''}
              onChange={(event) => update({ type, username: event.target.value })}
              placeholder="Username"
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={value?.password || ''}
              onChange={(event) => update({ type, password: event.target.value })}
              placeholder="Password"
            />
          </div>
        </div>
      )}

      {type === 'cookie' && (
        <div className="space-y-2">
          <Label>Cookies JSON</Label>
          <Textarea
            className="min-h-40 font-mono text-xs"
            value={cookiesToText(value?.cookies)}
            onChange={(event) => update({ type, cookies: parseCookies(event.target.value) })}
            placeholder='[{"name":"session_id","value":"abc123","domain":"example.com","path":"/"}]'
          />
        </div>
      )}

      {type === 'query_param' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Query param name</Label>
            <Input
              value={value?.queryParamName || ''}
              onChange={(event) => update({ type, queryParamName: event.target.value })}
              placeholder="token"
            />
          </div>
          <div className="space-y-2">
            <Label>Query param value</Label>
            <Input
              value={value?.queryParamValue || ''}
              onChange={(event) => update({ type, queryParamValue: event.target.value })}
              placeholder="Paste the query param value"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={value?.notes || ''}
          onChange={(event) => update({ type, notes: event.target.value })}
          placeholder="Optional notes for how auth should be applied during screenshot capture"
        />
      </div>
    </div>
  );
}
