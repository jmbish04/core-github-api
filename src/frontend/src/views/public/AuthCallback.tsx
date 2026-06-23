import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { handleGlobalError } from '@/lib/error-handler';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setApiKey } = useAuth();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      handleGlobalError(`Authentication failed: ${error}`);
      navigate('/login', { replace: true });
      return;
    }

    if (token) {
      try {
        setApiKey(token);
        // Add a small delay to allow cookie to set? usually not needed but safe.
        // Actually setApiKey handles cookie setting synchronously.
        const returnTo = searchParams.get('return_to') || '/dashboard';
        window.location.href = returnTo; 
        // navigate(returnTo, { replace: true });
      } catch (e) {
        console.error("Failed to set auth token", e);
        navigate('/login', { replace: true });
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, setApiKey]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" /> Authenticating
          </CardTitle>
          <CardDescription>
            Please wait while we log you in...
          </CardDescription>
        </CardHeader>
        <CardContent>
        </CardContent>
      </Card>
    </div>
  );
}
