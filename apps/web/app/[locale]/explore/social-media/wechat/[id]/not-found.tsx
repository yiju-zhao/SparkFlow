import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function WechatArticleNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold mb-2">Article Not Found</h2>
      <p className="text-muted-foreground mb-6">
        This article may have been removed or the link is incorrect.
      </p>
      <Button variant="outline" asChild>
        <Link href="/explore/social-media/wechat">Back to Articles</Link>
      </Button>
    </div>
  );
}
