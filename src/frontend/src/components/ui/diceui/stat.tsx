import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface StatProps {
    title: string;
    value: string | number;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    info?: string;
    className?: string;
}

export function StatCard({ title, value, icon, trend, trendValue, info, className }: StatProps) {
    return (
        <Card className={cn("border-zinc-800 bg-zinc-900/50", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
                {icon && <div className="text-zinc-500">{icon}</div>}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-zinc-100">{value}</div>
                {(trend || info) && (
                    <div className="flex items-center text-xs text-zinc-500 mt-1 space-x-2">
                        {trend && (
                            <span className={cn("flex items-center", {
                                "text-emerald-500": trend === 'up',
                                "text-red-500": trend === 'down',
                                "text-zinc-500": trend === 'neutral'
                            })}>
                                {trend === 'up' && <ArrowUp className="w-3 h-3 mr-1" />}
                                {trend === 'down' && <ArrowDown className="w-3 h-3 mr-1" />}
                                {trend === 'neutral' && <Minus className="w-3 h-3 mr-1" />}
                                {trendValue}
                            </span>
                        )}
                        {info && <span>{info}</span>}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
