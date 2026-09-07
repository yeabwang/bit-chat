import React from "react";
import { ASSETS } from "../../data/assets";
import Icon from "../Icon/Icon";

export default function SearchBar({ value, onChange, placeholder = "Search..." }) {
  return <div className="search-box"><Icon src={ASSETS.search} /><input placeholder={placeholder} value={value} onChange={onChange} /></div>;
}
