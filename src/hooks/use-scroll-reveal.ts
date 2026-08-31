import { useEffect } from "react";

/**
 * 滾動進場：帶 data-reveal 的元素進入視窗才加上 is-revealed 觸發動畫
 * 不支援 IntersectionObserver 或使用者偏好減少動態時，直接顯示不做動畫
 */
export function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      // 元素露出約一成、且離視窗底部還有一段距離時才觸發，避免太貼邊
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}
