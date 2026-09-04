import ArenaProfile from "@/components/ArenaProfile";
export default async function CoachPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <ArenaProfile slug={slug}/>; }
