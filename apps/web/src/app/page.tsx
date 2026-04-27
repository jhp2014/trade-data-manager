import { Suspense } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import SearchSlide from '@/components/slides/SearchSlide';
import WorkspaceSlide from '@/components/slides/WorkspaceSlide';

export default function Home() {
    return (
        <Suspense>
            <MainLayout
                slide1={<SearchSlide />}
                slide2={<WorkspaceSlide />}
            />
        </Suspense>
    );
}