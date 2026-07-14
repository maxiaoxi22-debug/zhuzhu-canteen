"use client";

import Image from "next/image";

export default function PigHero({ value, celebrating }: { value: number; celebrating: boolean }) {
  const full = value >= 100;
  const speech = full ? "吃饱啦！谢谢你今天的投喂～" : value === 0 ? "猪猪饿着肚子等开饭～" : "再喂一口，我就更开心啦！";

  return (
    <div className={`pig-hero${celebrating ? " is-fed" : ""}`}>
      <div className="satiety-card">
        <span>今日饱饱值</span>
        <div><strong>{value}</strong><small>%</small></div>
        <div className="satiety-track"><i style={{ width: `${value}%` }} /></div>
      </div>
      <div className="pig-speech">{speech}</div>
      <Image
        src="/pig-mascot-cutout.png"
        alt="抱着饭碗、正在等开饭的小猪"
        width={286}
        height={286}
        priority
        className="pig-mascot"
      />
      <span className="pig-spark spark-one">✨</span>
      <span className="pig-spark spark-two">💗</span>
      <span className="pig-spark spark-three">✨</span>
    </div>
  );
}
