
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export default function LoginPage() {
    const [keyInput, setKeyInput] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || '/control-center/dashboard';

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!keyInput.trim()) return;

        login(keyInput.trim());
        navigate(from, { replace: true });
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-full max-w-sm">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        <Lock className="w-6 h-6" /> Auth Required
                    </CardTitle>
                    <CardDescription>
                        Enter your API Key to access the Control Center.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="sk-..."
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full">
                            Unlock
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
