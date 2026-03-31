import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export const DeploymentSelector = () => {
    const [autoDeploy, setAutoDeploy] = useState(false);
    
    return (
        <Card className="dark w-full max-w-lg bg-zinc-950 text-zinc-50 border-zinc-800 shadow-xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
                <CardTitle className="text-xl font-bold tracking-tight">Deployment Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="space-y-3">
                    <Label className="text-zinc-300 font-semibold tracking-wide uppercase text-xs">Target Environment</Label>
                    <Select defaultValue="edge">
                        <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 focus:ring-blue-500 h-11">
                            <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                            <SelectItem value="edge">Cloudflare Edge (Global)</SelectItem>
                            <SelectItem value="us-east">US East (Virginia)</SelectItem>
                            <SelectItem value="eu-central">EU Central (Frankfurt)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-md border border-zinc-800">
                    <div className="space-y-1 pr-4">
                        <Label className="text-sm font-semibold text-zinc-200">Autonomous Deployment</Label>
                        <p className="text-xs text-zinc-500 leading-relaxed max-w-[250px]">Allow agents to deploy unreviewed PRs when confidence &gt; 95%.</p>
                    </div>
                    <Switch checked={autoDeploy} onCheckedChange={setAutoDeploy} className="data-[state=checked]:bg-blue-600" />
                </div>
            </CardContent>
            <CardFooter className="flex justify-end pt-4 pb-6 px-6 gap-3">
                <Button variant="outline" className="border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300">Cancel</Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">Save Strategy</Button>
            </CardFooter>
        </Card>
    );
};
