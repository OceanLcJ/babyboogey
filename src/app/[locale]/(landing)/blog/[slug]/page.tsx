import { findPost } from "@/shared/services/post";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Post as PostType } from "@/shared/types/blocks/blog";
import { Empty } from "@/shared/blocks/common";
import { getThemePage } from "@/core/theme";
import moment from "moment";

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // load blog data
  const t = await getTranslations("blog");

  // get post data
  const postData = await findPost({ slug });
  if (!postData) {
    return <Empty message={`Post not found`} />;
  }

  // build post data
  const post: PostType = {
    id: postData.id,
    slug: postData.slug,
    title: postData.title || "",
    description: postData.description || "",
    content: postData.content || "",
    created_at: moment(postData.createdAt).format("MMM D, YYYY") || "",
    author_name: postData.authorName || "",
    author_image: postData.authorImage || "",
    url: `/blog/${postData.slug}`,
  };

  // load page component
  const Page = await getThemePage("blog-detail");

  return <Page locale={locale} post={post} />;
}
